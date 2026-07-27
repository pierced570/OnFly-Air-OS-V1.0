/**
 * Portal-safe estimated quotes by aircraft class.
 * Never includes operator name, tail, cost, or margin.
 */

import {
  classifyAircraftVertical,
  type VerticalId,
} from '@/domain/operatorVerticals'
import { buildQuoteTotals } from '@/domain/quote'
import type { Candidate } from '@/domain/routing'
import type { TaxRateRow } from '@/domain/tax'
import type { ChainLeg } from '@/domain/etaChain'

export const PORTAL_BANDS = [
  'piston',
  'turboprop',
  'light_jet',
  'larger',
] as const

export type PortalBand = (typeof PORTAL_BANDS)[number]

export const PORTAL_BAND_LABELS: Record<PortalBand, string> = {
  piston: 'Piston',
  turboprop: 'Turboprop',
  light_jet: 'Light jet',
  larger: 'Larger jet / freighter',
}

export type AircraftMetaForPortal = {
  aircraft_id: string
  category: string | null
  engines: string | null
  type_name: string | null
  mtow_lbs: number | null
}

export type PortalTimingBreakdown = {
  to_airport_min: number | null
  reposition_min: number
  live_leg_min: number
  turnaround_min: number | null
  eta_end: string
}

export type PortalPriceLine = {
  code: string
  label: string
  amount: number
}

export type PortalEstimateOption = {
  band: PortalBand
  label: string
  /** Among shown options, nearest reposition / drive-to-origin. */
  closest: boolean
  air_subtotal: number
  tax_total: number
  total: number
  price_lines: PortalPriceLine[]
  timing: PortalTimingBreakdown
  assumption_blurb: string
  confidence: number
}

export type PortalEstimateBundle = {
  options: PortalEstimateOption[]
  /** e.g. "Closest to you is a piston and a light jet" */
  closest_blurb: string
  disclaimer: string
  candidate_count: number
}

export function verticalToPortalBand(v: VerticalId): PortalBand | null {
  if (v === 'sep' || v === 'mep') return 'piston'
  if (v === 'setp' || v === 'metp') return 'turboprop'
  if (v === 'vlj_light') return 'light_jet'
  if (v === 'mid_heavy' || v === 'cargo') return 'larger'
  return null
}

export function formatApproxHours(min: number): string {
  if (min <= 0) return '0 hr'
  if (min < 45) return `${Math.round(min)} min`
  const h = Math.round((min / 60) * 2) / 2
  if (h === 1) return '1 hr'
  return `${h} hrs`
}

export function chainTiming(chain: ChainLeg[]): PortalTimingBreakdown {
  const truckPickup = sumDuration(
    chain.filter((l) => l.type === 'truck_pickup'),
  )
  const position = sumDuration(chain.filter((l) => l.type === 'position'))
  const live = sumDuration(chain.filter((l) => l.type === 'air_leg'))
  const turn = sumDuration(chain.filter((l) => l.type === 'ground_stop'))
  const eta_end = chain[chain.length - 1]?.est_end ?? new Date().toISOString()
  return {
    to_airport_min: truckPickup > 0 ? truckPickup : null,
    reposition_min: position,
    live_leg_min: live,
    turnaround_min: turn > 0 ? turn : null,
    eta_end,
  }
}

function sumDuration(legs: ChainLeg[]): number {
  return legs.reduce((n, l) => n + (l.duration_min || 0), 0)
}

function taxLineLabel(code: string, note: string): string {
  // Prefer engine note so FET % (cargo ~6.25% / pax ~7.5%) stays visible.
  if (code === 'FET_CARGO' || code === 'FET_PAX') {
    return note || 'Federal excise tax'
  }
  if (code === 'SEG_FEE_DOM') return note || 'Segment fees'
  if (code === 'INTL_HEAD') return note || 'International head tax'
  if (code === 'FET_EXEMPT_MTOW') return 'FET exemption (MTOW)'
  return note || code
}

export function buildPortalEstimates(
  candidates: Candidate[],
  meta: AircraftMetaForPortal[],
  opts: {
    payloadKind: 'cargo' | 'pax' | 'both'
    paxCount: number
    rates: TaxRateRow[]
  },
): PortalEstimateBundle {
  const metaById = new Map(meta.map((m) => [m.aircraft_id, m]))
  const byBand = new Map<PortalBand, Candidate[]>()

  for (const c of candidates) {
    const m = metaById.get(c.aircraft_id)
    const vertical = classifyAircraftVertical({
      category: m?.category ?? null,
      engines: m?.engines ?? null,
      type_name: m?.type_name ?? c.type_name,
    })
    const band = verticalToPortalBand(vertical)
    if (!band) continue
    const list = byBand.get(band) ?? []
    list.push(c)
    byBand.set(band, list)
  }

  const picks: Array<{ band: PortalBand; candidate: Candidate; timing: PortalTimingBreakdown }> =
    []

  for (const band of PORTAL_BANDS) {
    const list = byBand.get(band)
    if (!list?.length) continue
    const ranked = [...list].sort((a, b) => {
      const ta = chainTiming(a.chain)
      const tb = chainTiming(b.chain)
      const nearA = (ta.to_airport_min ?? 0) + ta.reposition_min
      const nearB = (tb.to_airport_min ?? 0) + tb.reposition_min
      if (nearA !== nearB) return nearA - nearB
      return a.price - b.price
    })
    const best = ranked[0]!
    picks.push({ band, candidate: best, timing: chainTiming(best.chain) })
  }

  const nearScores = picks.map(
    (p) => (p.timing.to_airport_min ?? 0) + p.timing.reposition_min,
  )
  const minNear = nearScores.length ? Math.min(...nearScores) : 0
  const closestBands = new Set(
    picks
      .filter((_p, i) => nearScores[i]! <= minNear + 20)
      .map((p) => p.band),
  )
  // Prefer at most two "closest" callouts — the absolute nearest band(s).
  if (closestBands.size > 2) {
    const ordered = [...picks].sort(
      (a, b) =>
        (a.timing.to_airport_min ?? 0) +
        a.timing.reposition_min -
        ((b.timing.to_airport_min ?? 0) + b.timing.reposition_min),
    )
    closestBands.clear()
    for (const p of ordered.slice(0, 2)) closestBands.add(p.band)
  }

  const options: PortalEstimateOption[] = picks.map(({ band, candidate, timing }) => {
    const m = metaById.get(candidate.aircraft_id)
    const totals = buildQuoteTotals(candidate, {
      markupMode: 'dollars',
      markupValue: 0,
      payloadKind: opts.payloadKind,
      mtowLbs: m?.mtow_lbs ?? null,
      paxCount: opts.paxCount,
      segments: 1,
      rates: opts.rates,
    })
    // Prefer candidate.price (already margin-applied) as air when markupValue is 0
    const air = totals.airSubtotal
    const price_lines: PortalPriceLine[] = [
      { code: 'AIR', label: 'Air transportation (est.)', amount: air },
      ...totals.tax.lines
        .filter((l) => l.amount > 0 || l.code === 'FET_EXEMPT_MTOW')
        .map((l) => ({
          code: l.code,
          label: taxLineLabel(l.code, l.note),
          amount: l.amount,
        })),
      { code: 'TOTAL', label: 'Estimated total', amount: totals.total },
    ]

    const toAirportBit =
      timing.to_airport_min != null
        ? `~${formatApproxHours(timing.to_airport_min)} to airport`
        : null
    const repoBit = `~${formatApproxHours(timing.reposition_min)} to reposition`
    const liveBit = `~${formatApproxHours(timing.live_leg_min)} live leg`
    const parts = [toAirportBit, repoBit, liveBit].filter(Boolean)
    const assumption_blurb = `Assumes ${parts.join(', ')}. Estimated total about $${Math.round(
      totals.total,
    ).toLocaleString('en-US')}.`

    return {
      band,
      label: PORTAL_BAND_LABELS[band],
      closest: closestBands.has(band),
      air_subtotal: air,
      tax_total: totals.tax.total,
      total: totals.total,
      price_lines,
      timing,
      assumption_blurb,
      confidence: candidate.confidence,
    }
  })

  const closestLabels = options
    .filter((o) => o.closest)
    .map((o) => o.label.toLowerCase())
  let closest_blurb = 'We’ll show class options that fit your cargo from nearby aircraft.'
  if (closestLabels.length === 1) {
    closest_blurb = `Closest to you is a ${closestLabels[0]}.`
  } else if (closestLabels.length === 2) {
    closest_blurb = `Closest to you is a ${closestLabels[0]} and a ${closestLabels[1]}.`
  } else if (closestLabels.length > 2) {
    closest_blurb = `Closest options: ${closestLabels.join(', ')}.`
  }

  return {
    options,
    closest_blurb,
    disclaimer:
      'Estimated quote from OnFly data — not a hard quote. Times and price are planning assumptions until operators confirm.',
    candidate_count: candidates.length,
  }
}
