/**
 * Unique ICAOs on a trip route (legs), for base-email / ETA autofill.
 */

export function tripRouteIcaos(trip: {
  legs?: Array<{ origin_icao?: string | null; dest_icao?: string | null }>
  quick?: { legs?: Array<{ origin_icao?: string | null; dest_icao?: string | null }> } | null
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined) => {
    const code = (raw ?? '').trim().toUpperCase()
    if (!code || seen.has(code)) return
    seen.add(code)
    out.push(code)
  }
  for (const leg of trip.legs ?? []) {
    push(leg.origin_icao)
    push(leg.dest_icao)
  }
  if (!out.length) {
    for (const leg of trip.quick?.legs ?? []) {
      push(leg.origin_icao)
      push(leg.dest_icao)
    }
  }
  return out
}
