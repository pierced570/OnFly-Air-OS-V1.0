/**
 * FlightAware-style tail activity: Scheduled / En Route / Arrived.
 * Pure TS — portal-safe (airports + times only, no operator identity).
 */

import { icaoMatch, normalizeIcao } from '@/domain/adsbActuals'
import { lookupAirport } from '@/domain/airports'

export type TailFlightBucket = 'scheduled' | 'en_route' | 'arrived'

/** Raw AeroAPI / mock hop — no operator names. */
export type TailFlightSnapshot = {
  id: string
  status?: string | null
  originIcao: string | null
  destIcao: string | null
  originCity?: string | null
  destCity?: string | null
  originTz?: string | null
  destTz?: string | null
  actualOff?: string | null
  actualOn?: string | null
  estimatedOff?: string | null
  estimatedOn?: string | null
  scheduledOff?: string | null
  scheduledOn?: string | null
  progressPct?: number | null
  aircraftType?: string | null
}

export type TailFlightLeg = {
  id: string
  bucket: TailFlightBucket
  statusLabel: string
  originIcao: string
  destIcao: string
  /** US ident without K prefix (CAK), matching FlightAware activity. */
  originIdent: string
  destIdent: string
  originPlace: string
  destPlace: string
  originTz: string
  destTz: string
  departAt: string | null
  arriveAt: string | null
  departIsActual: boolean
  arriveIsActual: boolean
  progressPct: number | null
  aircraftType: string | null
}

export type TailFlightActivityGroups = {
  scheduled: TailFlightLeg[]
  enRoute: TailFlightLeg[]
  arrived: TailFlightLeg[]
}

export function classifyTailFlightBucket(input: {
  status?: string | null
  actualOff?: string | null
  actualOn?: string | null
}): TailFlightBucket {
  const s = String(input.status ?? '').toLowerCase()
  if (input.actualOn) return 'arrived'
  if (
    s.includes('en route') ||
    s.includes('airborne') ||
    s.includes('taxi') ||
    (Boolean(input.actualOff) && !input.actualOn)
  ) {
    return 'en_route'
  }
  if (s.includes('arrived') || s.includes('landed')) return 'arrived'
  return 'scheduled'
}

export function displayIcaoIdent(icao: string): string {
  const n = normalizeIcao(icao)
  if (n.length === 4 && n.startsWith('K')) return n.slice(1)
  return n
}

function placeLabel(
  icao: string,
  city: string | null | undefined,
): string {
  if (city?.trim()) return city.trim()
  const ap = lookupAirport(icao)
  if (!ap) return icao
  return ap.state ? `${ap.city} · ${ap.state}` : ap.city || ap.name || icao
}

function tzFor(icao: string, tz: string | null | undefined): string {
  if (tz?.trim()) return tz.trim()
  return lookupAirport(icao)?.tz || 'UTC'
}

export function snapshotToTailFlightLeg(
  snap: TailFlightSnapshot,
): TailFlightLeg | null {
  const originIcao = normalizeIcao(snap.originIcao)
  const destIcao = normalizeIcao(snap.destIcao)
  if (!originIcao || !destIcao) return null
  const bucket = classifyTailFlightBucket({
    status: snap.status,
    actualOff: snap.actualOff,
    actualOn: snap.actualOn,
  })
  const departAt =
    snap.actualOff || snap.estimatedOff || snap.scheduledOff || null
  const arriveAt =
    snap.actualOn || snap.estimatedOn || snap.scheduledOn || null
  const pct =
    typeof snap.progressPct === 'number' && Number.isFinite(snap.progressPct)
      ? Math.max(0, Math.min(100, Math.round(snap.progressPct)))
      : null
  return {
    id: snap.id || `${originIcao}-${destIcao}-${departAt ?? ''}`,
    bucket,
    statusLabel:
      bucket === 'en_route'
        ? 'En Route'
        : bucket === 'arrived'
          ? 'Arrived'
          : 'Scheduled',
    originIcao,
    destIcao,
    originIdent: displayIcaoIdent(originIcao),
    destIdent: displayIcaoIdent(destIcao),
    originPlace: placeLabel(originIcao, snap.originCity),
    destPlace: placeLabel(destIcao, snap.destCity),
    originTz: tzFor(originIcao, snap.originTz),
    destTz: tzFor(destIcao, snap.destTz),
    departAt,
    arriveAt,
    departIsActual: Boolean(snap.actualOff),
    arriveIsActual: Boolean(snap.actualOn),
    progressPct: pct,
    aircraftType: snap.aircraftType?.trim() || null,
  }
}

export function legsFromSnapshots(
  snaps: TailFlightSnapshot[] | null | undefined,
): TailFlightLeg[] {
  return (snaps ?? [])
    .map(snapshotToTailFlightLeg)
    .filter((l): l is TailFlightLeg => Boolean(l))
}

/**
 * Portal: this trip's live hop, inbound to pickup, and the chain back.
 * Never the next job outbound from dest (other work).
 */
export function filterPortalTailActivity(
  legs: TailFlightLeg[],
  trip: { originIcao?: string | null; destIcao?: string | null },
): TailFlightLeg[] {
  const origin = trip.originIcao
  const dest = trip.destIcao
  const keep = new Set<string>()
  for (const leg of legs) {
    if (leg.bucket === 'en_route') keep.add(leg.id)
    if (icaoMatch(leg.destIcao, origin)) keep.add(leg.id)
    if (
      icaoMatch(leg.originIcao, origin) &&
      icaoMatch(leg.destIcao, dest)
    ) {
      keep.add(leg.id)
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const leg of legs) {
      if (keep.has(leg.id)) continue
      const feeds = legs.some(
        (k) => keep.has(k.id) && icaoMatch(leg.destIcao, k.originIcao),
      )
      if (feeds) {
        keep.add(leg.id)
        changed = true
      }
    }
  }
  return legs.filter((l) => keep.has(l.id))
}

export function groupTailFlightActivity(
  legs: TailFlightLeg[],
): TailFlightActivityGroups {
  const scheduled = legs
    .filter((l) => l.bucket === 'scheduled')
    .sort((a, b) => (a.departAt ?? '').localeCompare(b.departAt ?? ''))
  const enRoute = legs.filter((l) => l.bucket === 'en_route')
  const arrived = legs
    .filter((l) => l.bucket === 'arrived')
    .sort((a, b) => (b.arriveAt ?? '').localeCompare(a.arriveAt ?? ''))
  return { scheduled, enRoute, arrived }
}

export function tailActivityHasRows(g: TailFlightActivityGroups): boolean {
  return g.scheduled.length + g.enRoute.length + g.arrived.length > 0
}

/** Demo hops when AeroAPI is mocked — positioning into origin, then the live leg. */
export function mockTailFlightSnapshots(opts: {
  tail: string
  originIcao?: string | null
  destIcao?: string | null
  nowIso?: string
}): TailFlightSnapshot[] {
  const origin = normalizeIcao(opts.originIcao) || 'KCAK'
  const dest = normalizeIcao(opts.destIcao) || 'KBGR'
  const now = Date.parse(opts.nowIso ?? new Date().toISOString())
  const iso = (ms: number) => new Date(ms).toISOString()
  const tail = opts.tail.toUpperCase()
  return [
    {
      id: `${tail}-live`,
      status: 'Scheduled',
      originIcao: origin,
      destIcao: dest,
      scheduledOff: iso(now + 60 * 60_000),
      scheduledOn: iso(now + 4 * 60 * 60_000),
      aircraftType: null,
    },
    {
      id: `${tail}-pos`,
      status: 'En Route',
      originIcao: 'KPLD',
      destIcao: origin,
      actualOff: iso(now - 50 * 60_000),
      estimatedOn: iso(now + 40 * 60_000),
      progressPct: 35,
      aircraftType: null,
    },
    {
      id: `${tail}-prev`,
      status: 'Arrived',
      originIcao: 'KMCI',
      destIcao: 'KPLD',
      actualOff: iso(now - 48 * 60 * 60_000),
      actualOn: iso(now - 46 * 60 * 60_000),
      aircraftType: null,
    },
  ]
}
