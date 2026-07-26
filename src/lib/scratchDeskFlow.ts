/**
 * Desk flow: scratch notes → AI extract → QD-like trip draft → candidates → offers.
 * No live-leg / operator pricing on this path (operators quote via offer link).
 */

import { createLlmAdapter, type ExtractedRequest } from '@/adapters/llm'
import { parseDims } from '@/domain/dimsParser'
import { resolvePlaceToAirport } from '@/domain/resolvePlace'
import { generateCandidates, type Candidate } from '@/domain/routing'
import {
  mentionsRoundTrip,
  operatorMissionSummary,
  todayLocalDate,
  toolingDimsForParse,
} from '@/domain/standardTooling'
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
  openTripOffers,
  type OfferContactOverride,
} from '@/lib/offerFlow'
import { getScratchPad } from '@/lib/scratchPadStore'
import {
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'

export type DeskLeg = {
  id: string
  origin_icao: string
  dest_icao: string
  /** Local date — defaults to today at parse. */
  date: string
  pax: number
}

export type DeskDraft = {
  client_name: string
  /** Matched / selected directory client (null until matched or created). */
  client_id: string | null
  /** PO is not collected at parse — filled later in booking/financials. */
  po: string
  timing: 'asap' | 'scheduled'
  /** One-way unless notes/UI say roundtrip. */
  roundtrip: boolean
  cargo_only: boolean
  legs: DeskLeg[]
  pieces_text: string
  hazmat: boolean
  notes: string
  /** Original scratchpad notes — always keep visible on desk. */
  raw_notes: string
  payload_kind: 'cargo' | 'pax' | 'both'
  pax_count: number
  /** Synced from first leg for resolve/recommend. */
  origin_text: string
  destination_text: string
  asap: boolean
  ready_label: string
}

export function newDeskLeg(partial?: Partial<DeskLeg>): DeskLeg {
  return {
    id: crypto.randomUUID(),
    origin_icao: '',
    dest_icao: '',
    date: todayLocalDate(),
    pax: 0,
    ...partial,
  }
}

function icaoFromPlace(text: string | undefined): string {
  if (!text?.trim()) return ''
  return resolvePlaceToAirport(text)?.icao ?? text.trim().toUpperCase()
}

export function deskDraftFromExtract(
  ex: ExtractedRequest,
  rawNotes?: string,
): DeskDraft {
  const origin = icaoFromPlace(ex.origin_text)
  const dest = icaoFromPlace(ex.destination_text)
  // Default ASAP unless extract found a schedule cue.
  const asap = ex.asap !== false && !ex.ready_local
  const pax = ex.pax_count ?? 0
  const payload_kind = ex.payload_kind ?? (pax > 0 ? 'both' : 'cargo')
  const cargo_only = pax === 0 && payload_kind === 'cargo'
  const raw_notes = (rawNotes ?? ex.raw ?? '').trim()
  const today = todayLocalDate()
  const roundtrip = mentionsRoundTrip(raw_notes)
  return {
    client_name: ex.client_name?.trim() || '',
    client_id: null,
    po: '',
    timing: asap ? 'asap' : 'scheduled',
    roundtrip,
    cargo_only,
    legs: [
      newDeskLeg({
        origin_icao: origin,
        dest_icao: dest,
        date: today,
        pax: cargo_only ? 0 : pax,
      }),
    ],
    pieces_text: ex.pieces_text?.trim() || '',
    hazmat: Boolean(ex.hazmat),
    notes: ex.notes?.trim() || '',
    raw_notes,
    payload_kind,
    pax_count: pax,
    origin_text: origin || (ex.origin_text?.trim() || ''),
    destination_text: dest || (ex.destination_text?.trim() || ''),
    asap,
    ready_label: asap
      ? 'ASAP'
      : ex.ready_local?.trim() || `${today}`,
  }
}

/** Keep origin/dest/asap/payload in sync with QD-style controls. */
export function syncDeskDraftDerived(draft: DeskDraft): DeskDraft {
  const leg0 = draft.legs[0]
  const origin = leg0?.origin_icao?.trim().toUpperCase() || draft.origin_text
  const dest = leg0?.dest_icao?.trim().toUpperCase() || draft.destination_text
  const pax = draft.cargo_only
    ? 0
    : Math.max(draft.pax_count, leg0?.pax ?? 0, ...draft.legs.map((l) => l.pax))
  const payload_kind: DeskDraft['payload_kind'] = draft.cargo_only
    ? 'cargo'
    : pax > 0
      ? draft.pieces_text.trim()
        ? 'both'
        : 'pax'
      : draft.payload_kind === 'cargo'
        ? 'cargo'
        : 'both'
  const asap = draft.timing === 'asap'
  return {
    ...draft,
    origin_text: origin,
    destination_text: dest,
    pax_count: pax,
    payload_kind,
    asap,
    ready_label: asap
      ? 'ASAP'
      : draft.ready_label && draft.ready_label !== 'ASAP'
        ? draft.ready_label
        : leg0?.date || 'scheduled',
  }
}

export async function parseScratchToDeskDraft(): Promise<{
  extract: ExtractedRequest
  draft: DeskDraft
}> {
  const body = getScratchPad().body
  const extract = await createLlmAdapter().extractTripRequest(body)
  return { extract, draft: deskDraftFromExtract(extract, body) }
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
  draftIn: DeskDraft,
): Promise<DeskRecommendResult> {
  const draft = syncDeskDraftDerived(draftIn)
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
      : parseDims(toolingDimsForParse(draft.pieces_text || '')).pieces
  if (draft.payload_kind !== 'pax' && !pieces.length) {
    return {
      candidates: [],
      lane: `${origin.icao}→${destination.icao}`,
      error:
        'Add cargo (e.g. tools → standard tooling) or dims @ weight — techs count as pax',
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
        pax_count: draft.cargo_only ? 0 : draft.pax_count || 0,
        hazmat: draft.hazmat,
        ready_at: new Date().toISOString(),
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

/** Spool trip offers for selected candidates — links only, no SMS/email ping. */
export async function sendDeskTripOffers(opts: {
  draft: DeskDraft
  candidates: Candidate[]
  /** Per-operator email / SMS / channel overrides from the desk. */
  contactOverrides?: Record<string, OfferContactOverride>
}): Promise<TripStoreRow> {
  if (!opts.candidates.length) throw new Error('Select at least one operator')
  const draft = syncDeskDraftDerived(opts.draft)
  const lane =
    draft.legs
      .map(
        (l) =>
          `${l.origin_icao || draft.origin_text || '?'}→${l.dest_icao || draft.destination_text || '?'}`,
      )
      .join(' · ') || `${draft.origin_text || '?'}→${draft.destination_text || '?'}`
  const payload =
    draft.pieces_text.trim() ||
    (draft.payload_kind === 'pax' ? 'pax' : 'cargo')
  const mission = operatorMissionSummary({
    pieces_text: draft.pieces_text,
    pax_count: draft.pax_count,
    cargo_only: draft.cargo_only,
  })
  const trip = createTripFromCandidates({
    lane,
    payload_summary: mission || payload,
    ready_label: draft.ready_label || (draft.asap ? 'ASAP' : 'scheduled'),
    candidates: opts.candidates,
    payload_kind: draft.payload_kind,
    client_id: draft.client_id || undefined,
  })
  mutateTrip(trip.id, (t) => {
    t.offers = buildOffersFromCandidates(
      trip.id,
      opts.candidates,
      opts.contactOverrides,
    )
    if (draft.client_id) t.client_id = draft.client_id
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'desk_scratch_spool',
      payload: {
        client_id: draft.client_id || null,
        client_name: draft.client_name || null,
        // PO deferred past parse stage
        po: null,
        roundtrip: draft.roundtrip,
        cargo_only: draft.cargo_only,
        legs: draft.legs,
        mission_summary: mission,
        cargo_summary: toolingDimsForParse(draft.pieces_text),
        notes: draft.notes || null,
        raw_notes: draft.raw_notes || null,
        notify: false,
      },
    })
  })
  await openTripOffers(trip.id)
  return getTrip(trip.id)!
}
