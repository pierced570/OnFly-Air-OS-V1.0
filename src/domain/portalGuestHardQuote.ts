/**
 * Guest (no-login) hard-quote page — "What dispatch sees" preview + soft band.
 * Pure TypeScript.
 */

import { lookupAirport } from '@/domain/airports'
import {
  softQuoteFor,
  type SoftQuoteClassResult,
  type SoftQuotePoint,
} from '@/domain/portalSoftQuote'
import {
  ASAP_MAX_HOURS,
  cargoPiecesFromDraft,
  forkliftFromDraft,
  type ServiceMode,
  type TripRequestDraft,
} from '@/domain/tripRequest'

export type PortalDispatchSeesRow = {
  label: string
  value: string
}

export type PortalDispatchSeesView = {
  ready: boolean
  who: string
  move: string
  readyLine: string
  cargo: string
  flags: string
  rows: PortalDispatchSeesRow[]
  soft: SoftQuoteClassResult | null
  softNm: number | null
  softNmLabel: string | null
  from: SoftQuotePoint | null
  to: SoftQuotePoint | null
}

function serviceModeLabel(mode: ServiceMode): string {
  if (mode === 'd2d') return 'Door → Door'
  if (mode === 'mixed') return 'Combination'
  return 'Airport → Airport'
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function softPointFromIcao(icao: string): SoftQuotePoint | null {
  const code = icao.trim().toUpperCase()
  if (!code || code === 'TBD') return null
  const ap = lookupAirport(code)
  if (!ap) return { lat: 39.5, lon: -98.3, code }
  return {
    lat: ap.lat,
    lon: ap.lon,
    code: ap.icao,
    city: ap.state ? `${ap.city}, ${ap.state}` : ap.city,
  }
}

/** Live preview for the guest hard-quote right rail. */
export function buildPortalDispatchSees(
  draft: TripRequestDraft,
): PortalDispatchSeesView {
  const leg = draft.legs[0]
  const origin = (leg?.origin_icao ?? '').trim().toUpperCase()
  const dest = (leg?.dest_icao ?? '').trim().toUpperCase()
  const from = softPointFromIcao(origin)
  const to = softPointFromIcao(dest)

  const company = draft.client_name?.trim() || '—'
  const email = draft.email?.trim() || '—'
  const who = `${company} · ${email}`

  const dir = draft.direction === 'round_trip' ? 'round trip' : 'one-way'
  const lane =
    origin && dest ? `${origin} → ${dest}` : origin || dest || 'Route TBD'
  const move = `${serviceModeLabel(draft.service_mode)} · ${lane} · ${dir}`

  const readyTiming =
    draft.timing === 'asap'
      ? `Within ${ASAP_MAX_HOURS} h`
      : 'Scheduled'
  const deadline = draft.hard_deadline_at?.trim()
  const readyLine = deadline
    ? `${readyTiming} · deadline ${deadline}`
    : readyTiming

  const pieces = cargoPiecesFromDraft(draft)
  const pc = pieces.reduce((s, p) => s + (p.count || 1), 0)
  const dims = pieces
    .filter((p) => p.l_in > 0 && p.w_in > 0 && p.h_in > 0)
    .map((p) => `${p.l_in}×${p.w_in}×${p.h_in} in`)
    .slice(0, 2)
    .join(', ')
  const weight =
    (draft.cargo_weight_lbs === '' ? 0 : Number(draft.cargo_weight_lbs)) ||
    pieces.reduce((s, p) => s + (p.weight_lbs || 0) * (p.count || 1), 0)
  const pieceLabel =
    draft.cargo_only === false
      ? 'Pax'
      : pc > 0
        ? `${pc} pc${pc === 1 ? '' : 's'}`
        : weight > 0
          ? '1 pc'
          : null
  const cargoBits = [
    pieceLabel,
    dims || null,
    weight > 0 ? `${Math.round(weight)} lb` : null,
  ].filter(Boolean)
  const cargo = cargoBits.join(' · ') || 'Cargo TBD'

  const lift = forkliftFromDraft(draft)
  const flagBits: string[] = []
  if (draft.hazmat) flagBits.push('Hazmat')
  if (draft.forklift_required || lift.level === 'required') {
    flagBits.push('Forklift required')
  } else if (draft.forklift_recommended || lift.level === 'recommended') {
    flagBits.push('Forklift recommended')
  }
  if (draft.cargo_only !== false) flagBits.push('cargo only')
  const flags = flagBits.join(' · ') || '—'

  let soft: SoftQuoteClassResult | null = null
  let softNm: number | null = null
  let softNmLabel: string | null = null
  if (from && to) {
    const q = softQuoteFor(from, to)
    softNm = q.nm
    softNmLabel = q.nmLabel
    soft =
      q.classes.find((c) => c.name === 'Light jet' && !c.overRange) ??
      q.classes.find((c) => !c.overRange) ??
      q.classes[0] ??
      null
  }

  const ready =
    Boolean(draft.email.trim()) &&
    Boolean(origin) &&
    Boolean(dest) &&
    (draft.cargo_only === false || pieces.length > 0 || Boolean(draft.cargo_notes.trim()))

  const rows: PortalDispatchSeesRow[] = [
    { label: 'Who', value: who },
    { label: 'Move', value: move },
    { label: 'Ready', value: readyLine },
    { label: 'Cargo', value: cargo },
    { label: 'Flags', value: flags },
  ]

  return {
    ready,
    who,
    move,
    readyLine,
    cargo,
    flags,
    rows,
    soft,
    softNm,
    softNmLabel,
    from,
    to,
  }
}

export function portalGuestHardQuoteSoftBand(
  soft: SoftQuoteClassResult | null,
): { price: string; blurb: string } | null {
  if (!soft) return null
  return {
    price: soft.price.replace(' – ', ' — '),
    blurb: `${soft.name.toLowerCase()} · desk confirms the hard quote`,
  }
}

export function formatPortalGuestSoftMoney(low: number, high: number): string {
  return `${money(low)} — ${money(high)}`
}
