/**
 * Ops risk flags — after-hours / 24hr FBO, forklift at airports, IFR/LIFR wx.
 * Pure TypeScript. Flag, don't exclude — callers raise NEEDS-INFO / exceptions.
 */

import type { ChainLeg } from '@/domain/etaChain'
import type { FlightCategory } from '@/domain/flightCategory'
import type { ForkliftLevel } from '@/domain/forkliftHandling'
import { isLocalNightHour } from '@/domain/routing'

export type OpsFlagCode =
  | 'after_hours_no_24hr'
  | 'after_hours_no_fbo'
  | 'forklift_required_missing'
  | 'forklift_recommended_missing'
  | 'forklift_capacity_short'
  | 'ifr_metar'
  | 'ifr_taf'
  | 'lifr_metar'
  | 'lifr_taf'
  | 'ground_d2d'

export type OpsFlagSeverity = 'attn' | 'late'

export type OpsFlag = {
  code: OpsFlagCode
  severity: OpsFlagSeverity
  icao?: string
  title: string
  detail: string
  /** needs-info field key */
  field: string
}

export type FboOpsSnap = {
  name: string
  is_24hr: boolean
  forklift: boolean
  forklift_capacity_lbs: number | null
  fee_callout: number | null
}

export type AirportStopAt = {
  icao: string
  atIso: string
  tz?: string | null
  /** Why this time matters (truck airside, wheels down, …). */
  label: string
}

/** True when stop-local hour is before 06:00 or at/after 22:00. */
export function isAfterHoursLocal(
  isoUtc: string,
  tz?: string | null,
): boolean {
  return isLocalNightHour(isoUtc, tz)
}

/**
 * Extract airport ops touch-times from the ETA chain
 * (truck airside, position, wheels-down, dest offload / delivery start).
 */
export function airportStopsFromChain(legs: ChainLeg[]): AirportStopAt[] {
  const out: AirportStopAt[] = []
  const seen = new Set<string>()
  const push = (stop: AirportStopAt) => {
    const key = `${stop.icao}|${stop.atIso}|${stop.label}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(stop)
  }

  for (const leg of legs) {
    const toIcao = (leg.to.icao ?? '').toUpperCase()
    const fromIcao = (leg.from.icao ?? '').toUpperCase()

    if (
      toIcao &&
      (leg.type === 'truck_pickup' ||
        leg.type === 'offload' ||
        leg.type === 'position' ||
        leg.type === 'ground_stop')
    ) {
      push({
        icao: toIcao,
        atIso: leg.est_end,
        tz: leg.to.tz ?? leg.from.tz,
        label: leg.event || leg.label || leg.type,
      })
    }

    if (toIcao && leg.type === 'air_leg') {
      push({
        icao: toIcao,
        atIso: leg.est_end,
        tz: leg.to.tz ?? leg.from.tz,
        label: 'Wheels down',
      })
    }

    if (fromIcao && leg.type === 'truck_delivery') {
      push({
        icao: fromIcao,
        atIso: leg.est_start,
        tz: leg.from.tz ?? leg.to.tz,
        label: 'Ground depart FBO',
      })
    }
  }

  return out
}

export function evaluateAfterHoursFlags(
  stops: AirportStopAt[],
  fboByIcao: (icao: string) => FboOpsSnap | null,
): OpsFlag[] {
  const flags: OpsFlag[] = []
  const flagged = new Set<string>()

  for (const stop of stops) {
    if (!isAfterHoursLocal(stop.atIso, stop.tz)) continue
    const icao = stop.icao.toUpperCase()
    if (flagged.has(icao)) continue
    const fbo = fboByIcao(icao)

    if (!fbo) {
      flagged.add(icao)
      flags.push({
        code: 'after_hours_no_fbo',
        severity: 'attn',
        icao,
        title: `After-hours · ${icao} — no FBO on file`,
        detail: `${stop.label} falls outside 06:00–22:00 local — confirm 24hr ops / callout before commit.`,
        field: `after_hours_${icao}`,
      })
      continue
    }

    if (fbo.is_24hr) continue

    flagged.add(icao)
    flags.push({
      code: 'after_hours_no_24hr',
      severity: 'attn',
      icao,
      title: `After-hours · ${icao} — not 24hr`,
      detail: `${fbo.name} @ ${icao}: ${stop.label} is after hours (before 06:00 / after 22:00 local). Callout ${
        fbo.fee_callout != null ? `$${fbo.fee_callout}` : 'TBD'
      }; confirm after-hours coverage.`,
      field: `after_hours_${icao}`,
    })
  }

  return flags
}

/** Whether ops at this ICAO at `atIso` should bill FBO callout (night + not 24hr). */
export function shouldApplyCalloutFee(
  atIso: string | null | undefined,
  tz: string | null | undefined,
  fbo: FboOpsSnap | null,
): boolean {
  if (!atIso || !fbo) return false
  if (fbo.is_24hr) return false
  if (!isAfterHoursLocal(atIso, tz)) return false
  return fbo.fee_callout != null && fbo.fee_callout > 0
}

export function evaluateForkliftFlags(input: {
  level: ForkliftLevel
  heaviestLbs?: number | null
  originIcao?: string | null
  destIcao?: string | null
  fboByIcao: (icao: string) => FboOpsSnap | null
}): OpsFlag[] {
  if (input.level === 'none') return []
  const flags: OpsFlag[] = []
  const icaos = [input.originIcao, input.destIcao]
    .map((c) => (c ?? '').toUpperCase())
    .filter(Boolean)
  const unique = [...new Set(icaos)]

  for (const icao of unique) {
    const fbo = input.fboByIcao(icao)
    if (!fbo) {
      flags.push({
        code:
          input.level === 'required'
            ? 'forklift_required_missing'
            : 'forklift_recommended_missing',
        severity: input.level === 'required' ? 'late' : 'attn',
        icao,
        title: `Forklift · ${icao} — no FBO on file`,
        detail:
          input.level === 'required'
            ? `Forklift required for cargo — add FBO forklift capacity at ${icao}.`
            : `Forklift recommended — confirm ground handling at ${icao}.`,
        field: `forklift_${icao}`,
      })
      continue
    }
    if (!fbo.forklift) {
      flags.push({
        code:
          input.level === 'required'
            ? 'forklift_required_missing'
            : 'forklift_recommended_missing',
        severity: input.level === 'required' ? 'late' : 'attn',
        icao,
        title: `Forklift · ${icao} — ${fbo.name} has none`,
        detail:
          input.level === 'required'
            ? `Forklift required — ${fbo.name} @ ${icao} is not marked forklift-capable.`
            : `Forklift recommended — ${fbo.name} @ ${icao} has no forklift on file.`,
        field: `forklift_${icao}`,
      })
      continue
    }
    const need = input.heaviestLbs
    const cap = fbo.forklift_capacity_lbs
    if (
      need != null &&
      Number.isFinite(need) &&
      need > 0 &&
      cap != null &&
      need > cap
    ) {
      flags.push({
        code: 'forklift_capacity_short',
        severity: 'late',
        icao,
        title: `Forklift capacity · ${icao}`,
        detail: `Heaviest piece ${Math.round(need)} lb exceeds ${fbo.name} capacity ${cap.toLocaleString()} lb.`,
        field: `forklift_cap_${icao}`,
      })
    }
  }

  return flags
}

export function isIfrOrWorse(
  cat: FlightCategory | null | undefined,
): cat is 'IFR' | 'LIFR' {
  return cat === 'IFR' || cat === 'LIFR'
}

export function evaluateWxIfrFlags(
  briefs: Array<{
    icao: string
    flightCat?: FlightCategory | null
    tafWorstCat?: FlightCategory | null
  }>,
): OpsFlag[] {
  const flags: OpsFlag[] = []
  for (const b of briefs) {
    const icao = b.icao.toUpperCase()
    if (isIfrOrWorse(b.flightCat)) {
      flags.push({
        code: b.flightCat === 'LIFR' ? 'lifr_metar' : 'ifr_metar',
        severity: 'late',
        icao,
        title: `${b.flightCat} · ${icao} (METAR)`,
        detail: `Destination/stop ${icao} reporting ${b.flightCat} — confirm approach mins / alternate before commit.`,
        field: `wx_metar_${icao}`,
      })
    }
    if (isIfrOrWorse(b.tafWorstCat) && b.tafWorstCat !== b.flightCat) {
      flags.push({
        code: b.tafWorstCat === 'LIFR' ? 'lifr_taf' : 'ifr_taf',
        severity: 'late',
        icao,
        title: `${b.tafWorstCat} · ${icao} (TAF)`,
        detail: `TAF at ${icao} includes ${b.tafWorstCat} — flag for dispatcher review vs ETA window.`,
        field: `wx_taf_${icao}`,
      })
    } else if (
      isIfrOrWorse(b.tafWorstCat) &&
      !isIfrOrWorse(b.flightCat)
    ) {
      flags.push({
        code: b.tafWorstCat === 'LIFR' ? 'lifr_taf' : 'ifr_taf',
        severity: 'late',
        icao,
        title: `${b.tafWorstCat} · ${icao} (TAF)`,
        detail: `TAF at ${icao} includes ${b.tafWorstCat} — flag for dispatcher review vs ETA window.`,
        field: `wx_taf_${icao}`,
      })
    }
  }
  return flags
}

/** Client-safe / desk notes for ETA sheet + hard quote (no carrier names). */
export function buildOpsSheetNotes(input: {
  pattern?: string | null
  hasTruckLegs?: boolean
  forkliftLevel?: ForkliftLevel
  flags: OpsFlag[]
}): string[] {
  const notes: string[] = []
  const pattern = (input.pattern ?? '').toUpperCase()
  if (
    pattern === 'D2D' ||
    pattern === 'D2A' ||
    pattern === 'A2D' ||
    input.hasTruckLegs
  ) {
    notes.push(
      'Ground transport on timeline — pickup / delivery legs included on this ETA sheet.',
    )
  }
  if (input.forkliftLevel === 'required') {
    notes.push('Forklift required at cargo airports — confirm FBO capacity.')
  } else if (input.forkliftLevel === 'recommended') {
    notes.push('Forklift recommended for heaviest pieces — confirm FBO.')
  }
  for (const f of input.flags) {
    if (
      f.code === 'after_hours_no_24hr' ||
      f.code === 'after_hours_no_fbo' ||
      f.code.startsWith('ifr') ||
      f.code.startsWith('lifr') ||
      f.code.startsWith('forklift')
    ) {
      notes.push(`${f.title}: ${f.detail}`)
    }
  }
  return [...new Set(notes)]
}
