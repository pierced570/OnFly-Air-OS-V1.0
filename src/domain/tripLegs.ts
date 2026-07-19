/**
 * Bridge quote ETA chain ↔ booked trip_legs, and apply thread actuals + recompute.
 * Pure TypeScript (no React / Supabase).
 */

import {
  DEFAULT_LEG_DEFAULTS,
  recompute,
  type ChainLeg,
  type ChainLegType,
} from '@/domain/etaChain'
import type { ParsedActual } from '@/domain/threadParse'

/** App leg row shape (mirrors tripStore.TripLegRow without importing the store). */
export type AppLeg = {
  id: string
  seq: number
  type: string
  label: string
  status: 'pending' | 'active' | 'done'
  origin?: string
  dest?: string
  est_start: string | null
  est_end: string | null
  actual_start: string | null
  actual_end: string | null
  one_tap_token: string
  party: string
}

/** Map domain chain types onto DB leg_type (+ position). */
export function toDbLegType(type: ChainLegType | string): string {
  if (type === 'position') return 'position'
  if (type === 'truck_pickup') return 'truck_pickup'
  if (type === 'truck_delivery') return 'truck_delivery'
  if (type === 'air_leg') return 'air_leg'
  if (type === 'ground_stop') return 'ground_stop'
  if (type === 'offload') return 'offload'
  if (type === 'customs') return 'customs'
  // QD "position" / unknown → ground_stop for DB safety if enum missing
  return type === 'position' ? 'position' : 'ground_stop'
}

export function partyForLegType(type: string): string {
  if (type.startsWith('truck') || type === 'offload') return 'driver'
  if (type === 'air_leg' || type === 'position') return 'pilot'
  return 'dispatcher'
}

function tapToken(kind: string): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  return `${kind}-${id}`
}

/** Materialize a quote/buildChain result into booked trip legs. */
export function materializeChainToLegs(
  chain: ChainLeg[],
  opts?: { tapPrefix?: string },
): AppLeg[] {
  return chain.map((leg, i) => {
    const type = toDbLegType(leg.type)
    const kind =
      type === 'air_leg' ? 'air' : type.startsWith('truck') ? 'trk' : 'leg'
    return {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `leg-${leg.seq}-${i}`,
      seq: leg.seq,
      type,
      label: leg.label,
      status: i === 0 ? 'active' : 'pending',
      origin: leg.from.icao,
      dest: leg.to.icao,
      est_start: leg.est_start,
      est_end: leg.est_end,
      actual_start: leg.actual_start ?? null,
      actual_end: leg.actual_end ?? null,
      one_tap_token: tapToken(opts?.tapPrefix ?? kind),
      party: partyForLegType(type),
    }
  })
}

export function legsToChain(legs: AppLeg[]): ChainLeg[] {
  return legs.map((l) => ({
    seq: l.seq,
    type: (l.type as ChainLegType) || 'ground_stop',
    branch: l.type.startsWith('truck')
      ? 'truck'
      : l.type === 'air_leg' || l.type === 'position'
        ? 'air'
        : 'merged',
    label: l.label,
    event: l.label,
    from: { lat: 0, lon: 0, icao: l.origin },
    to: { lat: 0, lon: 0, icao: l.dest },
    est_start: l.est_start ?? new Date().toISOString(),
    est_end: l.est_end ?? new Date().toISOString(),
    actual_start: l.actual_start,
    actual_end: l.actual_end,
    duration_min: 0,
    source: l.actual_end || l.actual_start ? 'actual' : 'assumed',
    duration_source: l.actual_end || l.actual_start ? 'actual' : 'booked',
  }))
}

export function applyChainToLegs(legs: AppLeg[], chain: ChainLeg[]): AppLeg[] {
  const bySeq = new Map(chain.map((c) => [c.seq, c]))
  return legs.map((l) => {
    const c = bySeq.get(l.seq)
    if (!c) return l
    return {
      ...l,
      est_start: c.est_start,
      est_end: c.est_end,
      actual_start: c.actual_start ?? l.actual_start,
      actual_end: c.actual_end ?? l.actual_end,
    }
  })
}

/** Which leg seq should receive a parsed thread actual. */
export function resolveLegSeqForActual(
  legs: AppLeg[],
  parsed: ParsedActual,
): number | null {
  if (parsed.kind === 'unknown') return null
  const open =
    legs.find((l) => l.status === 'active') ??
    legs.find((l) => l.status === 'pending')
  if (!open) return null

  if (parsed.kind === 'wheels_up' || parsed.kind === 'wheels_down') {
    const air =
      legs.find((l) => l.type === 'air_leg' && l.status !== 'done') ?? open
    return air.seq
  }
  if (parsed.kind === 'delivered') {
    const del =
      legs.find(
        (l) =>
          (l.type === 'offload' || l.type === 'truck_delivery') &&
          l.status !== 'done',
      ) ?? legs[legs.length - 1]
    return del?.seq ?? null
  }
  if (parsed.kind === 'loaded' || parsed.kind === 'arrived' || parsed.kind === 'en_route') {
    return open.seq
  }
  if (parsed.kind === 'eta_relative') {
    return open.seq
  }
  return open.seq
}

export type ApplyActualResult = {
  legs: AppLeg[]
  slippedMinutes: number
  appliedSeq: number | null
  autoApplied: boolean
}

/**
 * Apply a parsed thread actual to legs and cascade recompute.
 * High-confidence (≥0.9) writes actuals; lower confidence only revises ETA.
 */
export function applyParsedActualToLegs(
  legs: AppLeg[],
  parsed: ParsedActual,
  nowIso = new Date().toISOString(),
): ApplyActualResult {
  if (parsed.kind === 'unknown' || !legs.length) {
    return { legs, slippedMinutes: 0, appliedSeq: null, autoApplied: false }
  }

  const seq = resolveLegSeqForActual(legs, parsed)
  if (seq == null) {
    return { legs, slippedMinutes: 0, appliedSeq: null, autoApplied: false }
  }

  const chain = legsToChain(legs)
  const autoApplied = parsed.confidence >= 0.9
  let update: { seq: number; actual_start?: string; actual_end?: string }

  if (parsed.kind === 'eta_relative') {
    const leg = chain.find((c) => c.seq === seq)!
    const end = new Date(Date.parse(nowIso) + parsed.minutes * 60_000).toISOString()
    // Soft ETA revise without marking actual
    leg.est_end = end
    const slipped = Math.round(
      (Date.parse(end) - Date.parse(leg.est_start)) / 60_000 - 0,
    )
    // Shift subsequent by delta from previous est_end
    const idx = chain.findIndex((c) => c.seq === seq)
    const prevEnd = legs.find((l) => l.seq === seq)?.est_end
    const deltaMin = prevEnd
      ? (Date.parse(end) - Date.parse(prevEnd)) / 60_000
      : 0
    if (Math.abs(deltaMin) >= 0.5) {
      for (let i = idx + 1; i < chain.length; i++) {
        const l = chain[i]!
        l.est_start = new Date(
          Date.parse(l.est_start) + deltaMin * 60_000,
        ).toISOString()
        l.est_end = new Date(
          Date.parse(l.est_end) + deltaMin * 60_000,
        ).toISOString()
      }
    }
    return {
      legs: applyChainToLegs(legs, chain).map((l) => {
        if (l.seq !== seq) return l
        return { ...l, est_end: end }
      }),
      slippedMinutes: Math.round(deltaMin || slipped),
      appliedSeq: seq,
      autoApplied: false,
    }
  }

  if (
    parsed.kind === 'wheels_up' ||
    parsed.kind === 'en_route' ||
    parsed.kind === 'loaded' ||
    parsed.kind === 'arrived'
  ) {
    update = { seq, actual_start: nowIso }
  } else {
    // wheels_down / delivered
    update = { seq, actual_end: nowIso, actual_start: nowIso }
  }

  if (!autoApplied) {
    // Low confidence: revise est_end only (approve-don't-enter)
    const soft = chain.map((c) =>
      c.seq === seq
        ? {
            ...c,
            est_end:
              update.actual_end ??
              update.actual_start ??
              c.est_end,
          }
        : c,
    )
    return {
      legs: applyChainToLegs(legs, soft),
      slippedMinutes: 0,
      appliedSeq: seq,
      autoApplied: false,
    }
  }

  // Start-only actuals: slip against est_start so downstream ETAs move.
  if (update.actual_start && !update.actual_end) {
    const idx = chain.findIndex((c) => c.seq === seq)
    const leg = chain[idx]!
    const slipMin =
      (Date.parse(update.actual_start) - Date.parse(leg.est_start)) / 60_000
    leg.actual_start = update.actual_start
    if (Math.abs(slipMin) >= 0.5) {
      const dur =
        (Date.parse(leg.est_end) - Date.parse(leg.est_start)) / 60_000
      leg.est_start = update.actual_start
      leg.est_end = new Date(
        Date.parse(update.actual_start) + dur * 60_000,
      ).toISOString()
      for (let i = idx + 1; i < chain.length; i++) {
        const l = chain[i]!
        l.est_start = new Date(
          Date.parse(l.est_start) + slipMin * 60_000,
        ).toISOString()
        l.est_end = new Date(
          Date.parse(l.est_end) + slipMin * 60_000,
        ).toISOString()
      }
    }
    const nextLegs = applyChainToLegs(legs, chain).map((l) =>
      l.seq === seq
        ? { ...l, status: 'active' as const, actual_start: update.actual_start! }
        : l,
    )
    return {
      legs: nextLegs,
      slippedMinutes: Math.round(slipMin),
      appliedSeq: seq,
      autoApplied,
    }
  }

  const { chain: next, slippedMinutes } = recompute(
    chain,
    update,
    DEFAULT_LEG_DEFAULTS,
  )
  let nextLegs = applyChainToLegs(legs, next)

  if (update.actual_end) {
    nextLegs = nextLegs.map((l) => {
      if (l.seq !== seq) return l
      return {
        ...l,
        status: 'done' as const,
        actual_start: l.actual_start ?? nowIso,
        actual_end: nowIso,
      }
    })
    const pending = nextLegs.find((l) => l.status === 'pending')
    if (pending) {
      nextLegs = nextLegs.map((l) =>
        l.id === pending.id ? { ...l, status: 'active' as const } : l,
      )
    }
  }

  return {
    legs: nextLegs,
    slippedMinutes,
    appliedSeq: seq,
    autoApplied,
  }
}

/** Recompute after a one-tap / known actual on a leg seq. */
export function cascadeRecomputeFromActual(
  legs: AppLeg[],
  seq: number,
  actual: { actual_start?: string; actual_end?: string },
): { legs: AppLeg[]; slippedMinutes: number } {
  const chain = legsToChain(legs)
  const { chain: next, slippedMinutes } = recompute(chain, { seq, ...actual })
  return { legs: applyChainToLegs(legs, next), slippedMinutes }
}
