/**
 * Unique ICAOs on a trip route (legs), for base-email / ETA autofill.
 * Accepts store legs (`origin`/`dest`) and QD-style legs (`origin_icao`/`dest_icao`).
 */

type LegIcaos = {
  origin_icao?: string | null
  dest_icao?: string | null
  origin?: string | null
  dest?: string | null
}

export function tripRouteIcaos(trip: {
  legs?: LegIcaos[]
  quick?: { legs?: LegIcaos[] } | null
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined) => {
    const code = (raw ?? '').trim().toUpperCase()
    if (!code || seen.has(code)) return
    seen.add(code)
    out.push(code)
  }
  const pushLeg = (leg: LegIcaos) => {
    push(leg.origin_icao ?? leg.origin)
    push(leg.dest_icao ?? leg.dest)
  }
  for (const leg of trip.legs ?? []) pushLeg(leg)
  if (!out.length) {
    for (const leg of trip.quick?.legs ?? []) pushLeg(leg)
  }
  return out
}
