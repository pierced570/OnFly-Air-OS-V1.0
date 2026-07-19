import type { QuickDispatchMeta, TripStoreRow } from '@/lib/tripStore'

export type EtaSheetLine = {
  seq: number
  leg_label: string
  pickup_location: string
  where_going: string
  pickup_time_zulu: string
  depart_time_zulu: string
  arrive_time_zulu: string
}

export type EtaSheetContext = {
  tail: string
  po: string
  operator_name: string
  aircraft_type: string
  lines: EtaSheetLine[]
}

function parseDurationToMinutes(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g
  let total = 0
  let matched = false
  for (;;) {
    const m = re.exec(s)
    if (!m) break
    matched = true
    const value = Number(m[1])
    const unit = m[2]
    if (!Number.isFinite(value)) continue
    if (unit.startsWith('h')) total += value * 60
    else total += value
  }
  if (!matched || !Number.isFinite(total)) return null
  return Math.round(total)
}

function toZuluTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}Z`
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60 * 1000)
}

function parseLaneIcaos(lane: string): { origin: string; dest: string } | null {
  const m = lane.match(/([A-Z0-9]{3,4})\s*[→\-–]+\s*([A-Z0-9]{3,4})/i)
  if (!m) return null
  return { origin: m[1]!.toUpperCase(), dest: m[2]!.toUpperCase() }
}

export function computeEtaSheetLinesFromQuick(
  quick: QuickDispatchMeta,
  now = new Date(),
): EtaSheetLine[] {
  const lines: EtaSheetLine[] = []
  if (!quick.legs.length) return lines

  const baseNow = (() => {
    const first = quick.legs[0]
    if (quick.timing === 'scheduled' && first?.date) {
      return new Date(`${first.date}T12:00:00Z`)
    }
    return now
  })()

  let cursor = baseNow
  for (const [idx, leg] of quick.legs.entries()) {
    const repoMin = parseDurationToMinutes(leg.repo_time) ?? 0
    const liveMin = parseDurationToMinutes(leg.live_leg_time) ?? 0
    const pickupTime = cursor
    const departTime = addMinutes(pickupTime, repoMin)
    const arriveTime = addMinutes(departTime, liveMin)
    lines.push({
      seq: idx + 1,
      leg_label: `Leg ${idx + 1}`,
      pickup_location: leg.origin_icao || '—',
      where_going: leg.dest_icao || '—',
      pickup_time_zulu: toZuluTime(pickupTime),
      depart_time_zulu: toZuluTime(departTime),
      arrive_time_zulu: toZuluTime(arriveTime),
    })
    cursor = arriveTime
  }
  return lines
}

/** ETA sheet after hard-quote accept — uses selected offer times + lane ICAOs. */
export function computeEtaSheetFromBookedTrip(
  trip: TripStoreRow,
  now = new Date(),
): EtaSheetContext | null {
  if (trip.quick) {
    return {
      tail: trip.quick.tail,
      po: trip.quick.po,
      operator_name: trip.quick.operator_name,
      aircraft_type: trip.quick.aircraft_type,
      lines: computeEtaSheetLinesFromQuick(trip.quick, now),
    }
  }

  const selected =
    trip.offers.find((o) => o.state === 'selected') ??
    trip.offers.find((o) => o.state === 'quoted')
  if (!selected) return null

  const lane = parseLaneIcaos(trip.lane)
  const origin = lane?.origin ?? '????'
  const dest = lane?.dest ?? '????'
  const ttp = selected.time_to_position_min ?? 60
  const live = selected.live_leg_min ?? 90
  const pickup = now
  const depart = addMinutes(pickup, ttp)
  const arrive = addMinutes(depart, live)

  return {
    tail: selected.tail,
    po: `T-${trip.ref}`,
    operator_name: selected.operator_name,
    aircraft_type: selected.type_name ?? '',
    lines: [
      {
        seq: 1,
        leg_label: 'Leg 1',
        pickup_location: origin,
        where_going: dest,
        pickup_time_zulu: toZuluTime(pickup),
        depart_time_zulu: toZuluTime(depart),
        arrive_time_zulu: toZuluTime(arrive),
      },
    ],
  }
}
