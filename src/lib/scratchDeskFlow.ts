/**
 * Desk flow: scratch notes → AI extract → QD-like trip draft → candidates → offers.
 * No live-leg / operator pricing on this path (operators quote via offer link).
 * Supports A2A / D2D / A2D / D2A endpoint sheets after parse.
 */

import { createLlmAdapter, type ExtractedRequest } from '@/adapters/llm'
import { createMapsAdapter, resolveDoorLatLon } from '@/adapters/maps'
import { parseDims } from '@/domain/dimsParser'
import type { ServicePattern } from '@/domain/etaChain'
import {
  buildMissionEndpoint,
  buildMissionOpsFlags,
  missionLaneLabel,
  routingModeForPattern,
  type EndpointKind,
  type MissionOpsFlags,
} from '@/domain/missionMode'
import { resolvePlaceToAirport } from '@/domain/resolvePlace'
import {
  BUILTIN_RECOMMEND_MATRIX,
  type RecommendMatrixConfig,
} from '@/domain/recommendMatrix'
import { generateCandidates, type Candidate } from '@/domain/routing'
import {
  mentionsRoundTrip,
  operatorMissionSummary,
  todayLocalDate,
  toolingDimsForParse,
} from '@/domain/standardTooling'
import {
  clientRuleChips,
  clientRulesForRouting,
  getClient,
} from '@/lib/clientStore'
import { fleetStatusByTail } from '@/lib/fleetRadar'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { fboFeesForAirport } from '@/lib/fboStore'
import {
  loadPricingPriors,
  priorRatePerNm,
} from '@/lib/pricingPriorsStore'
import { addNeedsInfoTask } from '@/lib/needsInfoStore'
import {
  buildOffersFromCandidates,
  openTripOffers,
  sendAvailabilityPings,
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
  /** Air-segment origin ICAO (nearest airport when origin is a door). */
  origin_icao: string
  dest_icao: string
  origin_kind: EndpointKind
  dest_kind: EndpointKind
  /** Street / place text when kind=door (or free-text when airport). */
  origin_text: string
  dest_text: string
  /** Local date — defaults to today at parse. */
  date: string
  pax: number
  /** Ground courier directory ids when door legs need them. */
  origin_courier_id: string | null
  dest_courier_id: string | null
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
  /** A2A / D2D / A2D / D2A — drives parse sheet + waterfall chips. */
  service_pattern: ServicePattern
  /** Derived forklift / courier / pattern chips. */
  ops: MissionOpsFlags
}

export function newDeskLeg(partial?: Partial<DeskLeg>): DeskLeg {
  return {
    id: crypto.randomUUID(),
    origin_icao: '',
    dest_icao: '',
    origin_kind: 'airport',
    dest_kind: 'airport',
    origin_text: '',
    dest_text: '',
    date: todayLocalDate(),
    pax: 0,
    origin_courier_id: null,
    dest_courier_id: null,
    ...partial,
  }
}

function endpointFromExtract(text: string | undefined): {
  kind: EndpointKind
  text: string
  icao: string
} {
  const raw = (text ?? '').trim()
  const ep = buildMissionEndpoint(raw)
  return { kind: ep.kind, text: ep.text || raw, icao: ep.icao }
}

export function deskDraftFromExtract(
  ex: ExtractedRequest,
  rawNotes?: string,
): DeskDraft {
  const origin = endpointFromExtract(ex.origin_text)
  const dest = endpointFromExtract(ex.destination_text)
  // Default ASAP unless extract found a schedule cue.
  const asap = ex.asap !== false && !ex.ready_local
  const pax = ex.pax_count ?? 0
  const payload_kind = ex.payload_kind ?? (pax > 0 ? 'both' : 'cargo')
  const cargo_only = pax === 0 && payload_kind === 'cargo'
  const raw_notes = (rawNotes ?? ex.raw ?? '').trim()
  const today = todayLocalDate()
  const roundtrip = mentionsRoundTrip(raw_notes)
  const pieces_text = ex.pieces_text?.trim() || ''
  const ops = buildMissionOpsFlags({
    origin: {
      kind: origin.kind,
      text: origin.text,
      icao: origin.icao,
    },
    dest: { kind: dest.kind, text: dest.text, icao: dest.icao },
    pieces_text,
  })
  return {
    client_name: ex.client_name?.trim() || '',
    client_id: null,
    po: '',
    timing: asap ? 'asap' : 'scheduled',
    roundtrip,
    cargo_only,
    legs: [
      newDeskLeg({
        origin_icao: origin.icao,
        dest_icao: dest.icao,
        origin_kind: origin.kind,
        dest_kind: dest.kind,
        origin_text:
          origin.kind === 'airport' ? origin.icao || origin.text : origin.text,
        dest_text:
          dest.kind === 'airport' ? dest.icao || dest.text : dest.text,
        date: today,
        pax: cargo_only ? 0 : pax,
      }),
    ],
    pieces_text,
    hazmat: Boolean(ex.hazmat),
    notes: ex.notes?.trim() || '',
    raw_notes,
    payload_kind,
    pax_count: pax,
    origin_text:
      origin.kind === 'airport' ? origin.icao || origin.text : origin.text,
    destination_text:
      dest.kind === 'airport' ? dest.icao || dest.text : dest.text,
    asap,
    ready_label: asap
      ? 'ASAP'
      : ex.ready_local?.trim() || `${today}`,
    service_pattern: ops.pattern,
    ops,
  }
}

/**
 * Rebuild a desk draft from an open trip so Dispatch can re-run recommend
 * / send-to-new-operator without leaving the waterfall.
 */
export function deskDraftFromTrip(trip: {
  lane: string
  payload_summary: string
  ready_label: string
  client_id?: string | null
  service_pattern?: ServicePattern | null
  forklift_required?: boolean
  forklift_recommended?: boolean
  quick?: { client_name?: string } | null
}): DeskDraft {
  const parts = trip.lane
    .split(/\s*·\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  const first = parts[0] ?? ''
  const m = first.match(
    /^([A-Z0-9]{3,4})\s*(?:→|->|–|-)\s*([A-Z0-9]{3,4})$/i,
  )
  const originIcao = m?.[1]?.toUpperCase() ?? ''
  const destIcao = m?.[2]?.toUpperCase() ?? ''
  const paxMatch = trip.payload_summary.match(
    /(\d+)\s*(?:pax|passengers?|techs?|engineers?)\b/i,
  )
  const pax = paxMatch ? Number(paxMatch[1]) : 0
  const cargoBit = trip.payload_summary
    .replace(paxMatch?.[0] ?? '', '')
    .replace(/^\s*\+\s*/, '')
    .trim()
  const cargo_only = pax === 0
  const asap = /asap/i.test(trip.ready_label || '')
  const clientName =
    trip.quick?.client_name?.trim() ||
    (trip.client_id ? getClient(trip.client_id)?.name?.trim() || '' : '')
  const pattern = trip.service_pattern ?? 'A2A'
  const origin_kind: EndpointKind =
    pattern === 'D2D' || pattern === 'D2A' ? 'door' : 'airport'
  const dest_kind: EndpointKind =
    pattern === 'D2D' || pattern === 'A2D' ? 'door' : 'airport'
  return syncDeskDraftDerived({
    client_name: clientName,
    client_id: trip.client_id ?? null,
    po: '',
    timing: asap ? 'asap' : 'scheduled',
    roundtrip: parts.length > 1,
    cargo_only,
    legs: [
      newDeskLeg({
        origin_icao: originIcao,
        dest_icao: destIcao,
        origin_kind,
        dest_kind,
        origin_text: originIcao,
        dest_text: destIcao,
        pax: cargo_only ? 0 : pax,
      }),
    ],
    pieces_text: cargoBit,
    hazmat: false,
    notes: '',
    raw_notes: '',
    payload_kind: cargo_only ? 'cargo' : cargoBit ? 'both' : 'pax',
    pax_count: pax,
    origin_text: originIcao,
    destination_text: destIcao,
    asap,
    ready_label: trip.ready_label || (asap ? 'ASAP' : 'scheduled'),
    service_pattern: pattern,
    ops: buildMissionOpsFlags({
      origin: {
        kind: origin_kind,
        text: originIcao,
        icao: originIcao,
      },
      dest: { kind: dest_kind, text: destIcao, icao: destIcao },
      pieces_text: cargoBit,
    }),
  })
}

/** Keep origin/dest/asap/payload/pattern in sync with QD-style controls. */
export function syncDeskDraftDerived(draft: DeskDraft): DeskDraft {
  const legs = draft.legs.map((leg) => {
    const origin = buildMissionEndpoint(
      leg.origin_text || leg.origin_icao,
      leg.origin_kind,
      leg.origin_icao,
    )
    const dest = buildMissionEndpoint(
      leg.dest_text || leg.dest_icao,
      leg.dest_kind,
      leg.dest_icao,
    )
    return {
      ...leg,
      origin_kind: origin.kind,
      dest_kind: dest.kind,
      origin_text: origin.text || leg.origin_text,
      dest_text: dest.text || leg.dest_text,
      origin_icao: origin.icao || leg.origin_icao,
      dest_icao: dest.icao || leg.dest_icao,
      origin_courier_id:
        origin.kind === 'door' ? leg.origin_courier_id : null,
      dest_courier_id: dest.kind === 'door' ? leg.dest_courier_id : null,
    }
  })
  const leg0 = legs[0]
  const originEp = leg0
    ? {
        kind: leg0.origin_kind,
        text: leg0.origin_text,
        icao: leg0.origin_icao,
      }
    : buildMissionEndpoint(draft.origin_text)
  const destEp = leg0
    ? {
        kind: leg0.dest_kind,
        text: leg0.dest_text,
        icao: leg0.dest_icao,
      }
    : buildMissionEndpoint(draft.destination_text)
  const ops = buildMissionOpsFlags({
    origin: originEp,
    dest: destEp,
    pieces_text: draft.pieces_text,
  })
  const pax = draft.cargo_only
    ? 0
    : Math.max(draft.pax_count, leg0?.pax ?? 0, ...legs.map((l) => l.pax))
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
    legs,
    origin_text:
      originEp.kind === 'airport'
        ? originEp.icao || originEp.text
        : originEp.text || originEp.icao,
    destination_text:
      destEp.kind === 'airport'
        ? destEp.icao || destEp.text
        : destEp.text || destEp.icao,
    pax_count: pax,
    payload_kind,
    asap,
    ready_label: asap
      ? 'ASAP'
      : draft.ready_label && draft.ready_label !== 'ASAP'
        ? draft.ready_label
        : leg0?.date || 'scheduled',
    service_pattern: ops.pattern,
    ops,
  }
}

/** Blank desk draft — A2A until endpoints/cargo say otherwise. */
export function emptyDeskDraft(partial?: Partial<DeskDraft>): DeskDraft {
  return syncDeskDraftDerived({
    client_name: '',
    client_id: null,
    po: '',
    timing: 'asap',
    roundtrip: false,
    cargo_only: true,
    legs: [newDeskLeg()],
    pieces_text: '',
    hazmat: false,
    notes: '',
    raw_notes: '',
    payload_kind: 'cargo',
    pax_count: 0,
    origin_text: '',
    destination_text: '',
    asap: true,
    ready_label: 'ASAP',
    service_pattern: 'A2A',
    ops: buildMissionOpsFlags({
      origin: { kind: 'airport', text: '', icao: '' },
      dest: { kind: 'airport', text: '', icao: '' },
      pieces_text: '',
    }),
    ...partial,
  })
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
  opts?: {
    /**
     * Pass the editable Network Recommend matrix for new-request search only.
     * Default = builtins (Parse & shortlist / mid-trip add-operator).
     */
    matrix?: RecommendMatrixConfig
  },
): Promise<DeskRecommendResult> {
  const draft = syncDeskDraftDerived(draftIn)
  const client = draft.client_id ? getClient(draft.client_id) : undefined
  const client_rules = clientRulesForRouting(client, draft.payload_kind)
  const rule_chips = draft.client_id ? clientRuleChips(draft.client_id) : []
  const client_rules_applied = Boolean(client)
  const leg0 = draft.legs[0]
  const pattern = draft.service_pattern
  const lane = leg0
    ? missionLaneLabel(
        {
          kind: leg0.origin_kind,
          text: leg0.origin_text,
          icao: leg0.origin_icao,
        },
        {
          kind: leg0.dest_kind,
          text: leg0.dest_text,
          icao: leg0.dest_icao,
        },
      )
    : `${draft.origin_text || '?'}→${draft.destination_text || '?'}`

  const origin = resolvePlaceToAirport(leg0?.origin_icao || draft.origin_text)
  const destination = resolvePlaceToAirport(
    leg0?.dest_icao || draft.destination_text,
  )
  if (!origin || !destination) {
    const missingDoorAirport =
      (leg0?.origin_kind === 'door' && !origin) ||
      (leg0?.dest_kind === 'door' && !destination)
    return {
      candidates: [],
      lane,
      error: !origin
        ? missingDoorAirport && leg0?.origin_kind === 'door'
          ? `Pick nearest origin airport for door pickup (“${leg0.origin_text || '—'}”)`
          : `Could not resolve origin airport from “${leg0?.origin_icao || draft.origin_text || '—'}”`
        : missingDoorAirport && leg0?.dest_kind === 'door'
          ? `Pick nearest destination airport for door delivery (“${leg0.dest_text || '—'}”)`
          : `Could not resolve destination airport from “${leg0?.dest_icao || draft.destination_text || '—'}”`,
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
      lane,
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
      lane,
      error: 'No fleet loaded',
      client_rules_applied,
      rule_chips,
    }
  }

  const maps = createMapsAdapter()
  const radar = await fleetStatusByTail(fleet.map((a) => a.tail))
  const originFees = fboFeesForAirport(origin.icao)
  const destFees = fboFeesForAirport(destination.icao)
  const [priors] = await Promise.all([loadPricingPriors()])
  const matrix = opts?.matrix ?? BUILTIN_RECOMMEND_MATRIX

  const shipper =
    leg0?.origin_kind === 'door' && leg0.origin_text.trim()
      ? await resolveDoorLatLon(
          maps,
          leg0.origin_text,
          origin.lat,
          origin.lon,
          origin.tz,
        )
      : undefined
  const consignee =
    leg0?.dest_kind === 'door' && leg0.dest_text.trim()
      ? await resolveDoorLatLon(
          maps,
          leg0.dest_text,
          destination.lat,
          destination.lon,
          destination.tz,
        )
      : undefined

  try {
    const candidates = await generateCandidates(
      {
        mode: routingModeForPattern(pattern),
        payload_kind: draft.payload_kind,
        pieces,
        pax_count: draft.cargo_only ? 0 : draft.pax_count || 0,
        hazmat: draft.hazmat,
        ready_at: new Date().toISOString(),
        client_rules,
        origin: {
          kind: 'airport',
          text: origin.icao,
          icao: origin.icao,
          lat: origin.lat,
          lon: origin.lon,
          tz: origin.tz,
        },
        destination: {
          kind: 'airport',
          text: destination.icao,
          icao: destination.icao,
          lat: destination.lat,
          lon: destination.lon,
          tz: destination.tz,
        },
        shipper: shipper ?? undefined,
        consignee: consignee ?? undefined,
      },
      fleet,
      maps,
      {
        matrix,
        fleetStatusByTail: radar,
        fboFees: {
          origin: originFees.fee,
          dest: destFees.fee,
          notes: [...originFees.reasoning, ...destFees.reasoning],
        },
        priorRatePerNm: (typeName, operatorId) =>
          priorRatePerNm(typeName, operatorId, priors),
      },
    )
    return {
      candidates: candidates.slice(0, matrix.recommend_limit),
      lane,
      client_rules_applied,
      rule_chips,
    }
  } catch (e) {
    return {
      candidates: [],
      lane,
      error: e instanceof Error ? e.message : String(e),
      client_rules_applied,
      rule_chips,
    }
  }
}

/** Spool trip offers for selected candidates and email/SMS the quote-request links. */
export async function sendDeskTripOffers(opts: {
  draft: DeskDraft
  candidates: Candidate[]
  /** Per-operator email / SMS / channel overrides from the desk. */
  contactOverrides?: Record<string, OfferContactOverride>
}): Promise<TripStoreRow> {
  if (!opts.candidates.length) throw new Error('Select at least one operator')
  const draft = syncDeskDraftDerived(opts.draft)
  const leg0 = draft.legs[0]
  const lane =
    draft.legs
      .map((l) =>
        missionLaneLabel(
          {
            kind: l.origin_kind,
            text: l.origin_text,
            icao: l.origin_icao,
          },
          { kind: l.dest_kind, text: l.dest_text, icao: l.dest_icao },
        ),
      )
      .join(' · ') ||
    `${draft.origin_text || '?'}→${draft.destination_text || '?'}`
  const payload =
    draft.pieces_text.trim() ||
    (draft.payload_kind === 'pax' ? 'pax' : 'cargo')
  const mission = operatorMissionSummary({
    pieces_text: draft.pieces_text,
    pax_count: draft.pax_count,
    cargo_only: draft.cargo_only,
  })
  // Forklift only — never stuff A2A/D2D/ground-courier into operator payload.
  const opsBits = draft.ops.chips
    .filter((c) => /forklift/i.test(c))
    .join(' · ')
  const trip = createTripFromCandidates({
    lane,
    payload_summary: [mission || payload, opsBits].filter(Boolean).join(' · '),
    ready_label: draft.ready_label || (draft.asap ? 'ASAP' : 'scheduled'),
    candidates: opts.candidates,
    payload_kind: draft.payload_kind,
    client_id: draft.client_id || undefined,
    client_name: draft.client_name?.trim() || null,
    service_pattern: draft.service_pattern,
    forklift_required: draft.ops.forklift.level === 'required',
    forklift_recommended:
      draft.ops.forklift.level === 'recommended' ||
      draft.ops.forklift.level === 'required',
  })
  mutateTrip(trip.id, (t) => {
    t.offers = buildOffersFromCandidates(
      trip.id,
      opts.candidates,
      opts.contactOverrides,
    )
    if (draft.client_id) t.client_id = draft.client_id
    if (draft.client_name?.trim()) {
      const name = draft.client_name.trim()
      t.client_name = name
      if (t.quick) t.quick = { ...t.quick, client_name: name }
    }
    t.service_pattern = draft.service_pattern
    t.forklift_required = draft.ops.forklift.level === 'required'
    t.forklift_recommended =
      draft.ops.forklift.level === 'recommended' ||
      draft.ops.forklift.level === 'required'
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'desk_scratch_spool',
      payload: {
        client_id: draft.client_id || null,
        client_name: draft.client_name || null,
        po: null,
        roundtrip: draft.roundtrip,
        cargo_only: draft.cargo_only,
        legs: draft.legs,
        service_pattern: draft.service_pattern,
        forklift: draft.ops.forklift,
        needs_ground_courier: draft.ops.needs_ground_courier,
        mission_summary: mission,
        cargo_summary: toolingDimsForParse(draft.pieces_text),
        notes: draft.notes || null,
        raw_notes: draft.raw_notes || null,
        notify: true,
      },
    })
  })

  // Waterfall / Admin tasks — find people for forklift & ground courier.
  if (draft.ops.forklift.level !== 'none') {
    addNeedsInfoTask({
      entity_type: 'trip',
      entity_id: trip.id,
      entity_label: `T-${trip.ref} · ${lane}`,
      field: 'forklift',
      note:
        draft.ops.forklift.label ||
        `Forklift ${draft.ops.forklift.level} — find FBO / ground with capacity`,
      wizard: 'fbo',
    })
  }
  if (draft.ops.sheet.needs_origin_courier && !leg0?.origin_courier_id) {
    addNeedsInfoTask({
      entity_type: 'trip',
      entity_id: trip.id,
      entity_label: `T-${trip.ref} · ${lane}`,
      field: 'origin_ground_courier',
      note: `Assign origin ground courier (${draft.service_pattern}) — ${leg0?.origin_text || 'door pickup'}`,
      wizard: null,
    })
  }
  if (draft.ops.sheet.needs_dest_courier && !leg0?.dest_courier_id) {
    addNeedsInfoTask({
      entity_type: 'trip',
      entity_id: trip.id,
      entity_label: `T-${trip.ref} · ${lane}`,
      field: 'dest_ground_courier',
      note: `Assign dest ground courier (${draft.service_pattern}) — ${leg0?.dest_text || 'door delivery'}`,
      wizard: null,
    })
  }

  await openTripOffers(trip.id)
  await sendAvailabilityPings(trip.id)
  return getTrip(trip.id)!
}
