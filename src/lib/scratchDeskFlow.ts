/**
 * Desk flow: scratch notes → AI extract → candidates → trip offers → availability pings.
 */

import { createLlmAdapter, type ExtractedRequest } from '@/adapters/llm'
import { parseDims } from '@/domain/dimsParser'
import { resolvePlaceToAirport } from '@/domain/resolvePlace'
import { generateCandidates, type Candidate } from '@/domain/routing'
import { createMapsAdapter } from '@/adapters/maps'
import {
  clientRuleChips,
  clientRulesForRouting,
  getClient,
} from '@/lib/clientStore'
import { fleetStatusByTail } from '@/lib/fleetRadar'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { fboFeesForAirport } from '@/lib/fboStore'
import {
  buildOffersFromCandidates,
  sendAvailabilityPings,
} from '@/lib/offerFlow'
import { getScratchPad } from '@/lib/scratchPadStore'
import {
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'

export type DeskDraft = {
  client_name: string
  /** Matched / selected directory client (null until matched or created). */
  client_id: string | null
  origin_text: string
  destination_text: string
  pieces_text: string
  asap: boolean
  ready_label: string
  hazmat: boolean
  notes: string
  payload_kind: 'cargo' | 'pax' | 'both'
  pax_count: number
}

export function deskDraftFromExtract(ex: ExtractedRequest): DeskDraft {
  return {
    client_name: ex.client_name?.trim() || '',
    client_id: null,
    origin_text: ex.origin_text?.trim() || '',
    destination_text: ex.destination_text?.trim() || '',
    pieces_text: ex.pieces_text?.trim() || '',
    asap: Boolean(ex.asap),
    ready_label: ex.asap
      ? 'ASAP'
      : ex.ready_local?.trim() || '',
    hazmat: Boolean(ex.hazmat),
    notes: ex.notes?.trim() || '',
    payload_kind: ex.payload_kind ?? 'cargo',
    pax_count: ex.pax_count ?? 0,
  }
}

export async function parseScratchToDeskDraft(): Promise<{
  extract: ExtractedRequest
  draft: DeskDraft
}> {
  const body = getScratchPad().body
  const extract = await createLlmAdapter().extractTripRequest(body)
  return { extract, draft: deskDraftFromExtract(extract) }
}

export type DeskRecommendResult = {
  candidates: Candidate[]
  error?: string
  lane: string
  /** True when a directory client’s rules were applied to filtering. */
  client_rules_applied: boolean
  rule_chips: string[]
}

export async function recommendForDeskDraft(
  draft: DeskDraft,
): Promise<DeskRecommendResult> {
  const client = draft.client_id ? getClient(draft.client_id) : undefined
  const client_rules = clientRulesForRouting(client, draft.payload_kind)
  const rule_chips = draft.client_id ? clientRuleChips(draft.client_id) : []
  const client_rules_applied = Boolean(client)

  const origin = resolvePlaceToAirport(draft.origin_text)
  const destination = resolvePlaceToAirport(draft.destination_text)
  if (!origin || !destination) {
    return {
      candidates: [],
      lane: `${draft.origin_text || '?'}→${draft.destination_text || '?'}`,
      error: !origin
        ? `Could not resolve origin from “${draft.origin_text || '—'}”`
        : `Could not resolve destination from “${draft.destination_text || '—'}”`,
      client_rules_applied,
      rule_chips,
    }
  }

  let pieces =
    draft.payload_kind === 'pax'
      ? []
      : parseDims(draft.pieces_text || '').pieces
  // Techs + parts / mission text often has no dims yet — soft default for scoring.
  if (
    draft.payload_kind !== 'pax' &&
    !pieces.length &&
    /\b(techs?|parts?|engineers?|mechanics?|pax)\b/i.test(draft.pieces_text)
  ) {
    pieces = parseDims('1 skid 24x24x24 @ 150').pieces
  }
  if (draft.payload_kind !== 'pax' && !pieces.length) {
    return {
      candidates: [],
      lane: `${origin.icao}→${destination.icao}`,
      error: 'Add cargo dims with weight (e.g. 1 skid 48x40x60 @ 800ea)',
      client_rules_applied,
      rule_chips,
    }
  }

  const fleet = await loadFleetForRouting()
  if (!fleet.length) {
    return {
      candidates: [],
      lane: `${origin.icao}→${destination.icao}`,
      error: 'No fleet loaded',
      client_rules_applied,
      rule_chips,
    }
  }

  const maps = createMapsAdapter()
  const radar = await fleetStatusByTail(fleet.map((a) => a.tail))
  const originFees = fboFeesForAirport(origin.icao)
  const destFees = fboFeesForAirport(destination.icao)

  try {
    const candidates = await generateCandidates(
      {
        mode: 'a2a',
        payload_kind: draft.payload_kind,
        pieces,
        pax_count: draft.pax_count || 0,
        hazmat: draft.hazmat,
        ready_at: new Date().toISOString(),
        // Previous client → filter / soft-gate tails by their parameters.
        client_rules,
        origin: {
          kind: 'airport',
          text: draft.origin_text || origin.icao,
          icao: origin.icao,
          lat: origin.lat,
          lon: origin.lon,
          tz: origin.tz,
        },
        destination: {
          kind: 'airport',
          text: draft.destination_text || destination.icao,
          icao: destination.icao,
          lat: destination.lat,
          lon: destination.lon,
          tz: destination.tz,
        },
      },
      fleet,
      maps,
      {
        fleetStatusByTail: radar,
        fboFees: {
          origin: originFees.fee,
          dest: destFees.fee,
          notes: [...originFees.reasoning, ...destFees.reasoning],
        },
      },
    )
    return {
      candidates: candidates.slice(0, 8),
      lane: `${origin.icao}→${destination.icao}`,
      client_rules_applied,
      rule_chips,
    }
  } catch (e) {
    return {
      candidates: [],
      lane: `${origin.icao}→${destination.icao}`,
      error: e instanceof Error ? e.message : String(e),
      client_rules_applied,
      rule_chips,
    }
  }
}

/** Spool trip offers for selected candidates and ping availability. */
export async function sendDeskTripOffers(opts: {
  draft: DeskDraft
  candidates: Candidate[]
}): Promise<TripStoreRow> {
  if (!opts.candidates.length) throw new Error('Select at least one operator')
  const lane = `${opts.draft.origin_text || '?'}→${opts.draft.destination_text || '?'}`
  const payload =
    opts.draft.pieces_text.trim() ||
    (opts.draft.payload_kind === 'pax' ? 'pax' : 'cargo')
  const trip = createTripFromCandidates({
    lane,
    payload_summary: payload,
    ready_label: opts.draft.ready_label || (opts.draft.asap ? 'ASAP' : 'scheduled'),
    candidates: opts.candidates,
    payload_kind: opts.draft.payload_kind,
    client_id: opts.draft.client_id || undefined,
  })
  // Replace default top-5 with exactly the selected set
  mutateTrip(trip.id, (t) => {
    t.offers = buildOffersFromCandidates(trip.id, opts.candidates)
    if (opts.draft.client_id) t.client_id = opts.draft.client_id
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'desk_scratch_spool',
      payload: {
        client_id: opts.draft.client_id || null,
        client_name: opts.draft.client_name || null,
        notes: opts.draft.notes || null,
      },
    })
  })
  await sendAvailabilityPings(trip.id)
  return getTrip(trip.id)!
}
