/**
 * FBO fees with after-hours callout when ops fall outside 06:00–22:00 local
 * and the FBO is not 24hr.
 */

import {
  isAfterHoursLocal,
  shouldApplyCalloutFee,
  type FboOpsSnap,
} from '@/domain/opsFlags'
import {
  bestFboForAirport,
  fboFeesForAirport,
  type FboRow,
} from '@/lib/fboStore'

export function fboToOpsSnap(fbo: FboRow | null | undefined): FboOpsSnap | null {
  if (!fbo) return null
  return {
    name: fbo.name,
    is_24hr: fbo.is_24hr,
    forklift: fbo.forklift,
    forklift_capacity_lbs: fbo.forklift_capacity_lbs,
    fee_callout: fbo.fee_callout,
  }
}

export function lookupFboOpsSnap(icao: string): FboOpsSnap | null {
  return fboToOpsSnap(bestFboForAirport(icao))
}

/**
 * Handling + callout when `atIso` is after-hours local and FBO is not 24hr.
 * When `atIso` omitted, behaves like legacy handling-only.
 */
export function fboFeesForAirportAt(
  icao: string,
  atIso?: string | null,
  tz?: string | null,
): {
  fee: number
  fbo: FboRow | null
  reasoning: string[]
  afterHours: boolean
  calloutApplied: boolean
} {
  const fbo = bestFboForAirport(icao) ?? null
  const snap = fboToOpsSnap(fbo)
  const isNight = Boolean(atIso) && isAfterHoursLocal(atIso!, tz)
  const afterHours = Boolean(isNight && snap && !snap.is_24hr)
  const calloutApplied = shouldApplyCalloutFee(atIso, tz, snap)
  const priced = fboFeesForAirport(icao, calloutApplied)
  const reasoning = [...priced.reasoning]
  if (afterHours && !calloutApplied) {
    reasoning.push('after-hours (no callout fee on file)')
  }
  return {
    fee: priced.fee,
    fbo: priced.fbo,
    reasoning,
    afterHours,
    calloutApplied,
  }
}

/** Pair origin/dest fees for quote costing from ready / ETA times. */
export function resolveOriginDestFboFees(input: {
  originIcao: string
  destIcao: string
  originAtIso?: string | null
  destAtIso?: string | null
  originTz?: string | null
  destTz?: string | null
}): {
  origin: number
  dest: number
  notes: string[]
  originAfterHours: boolean
  destAfterHours: boolean
} {
  const o = fboFeesForAirportAt(
    input.originIcao,
    input.originAtIso,
    input.originTz,
  )
  const d = fboFeesForAirportAt(
    input.destIcao,
    input.destAtIso,
    input.destTz,
  )
  return {
    origin: o.fee,
    dest: d.fee,
    notes: [...o.reasoning, ...d.reasoning],
    originAfterHours: o.afterHours,
    destAfterHours: d.afterHours,
  }
}
