import type { QuickDispatchMeta } from '@/lib/tripStore'

export type EtaSheetLine = {
  seq: number
  leg_label: string
  pickup_location: string
  where_going: string
  pickup_time_zulu: string
  depart_time_zulu: string
  arrive_time_zulu: string
}

function parseDurationToMinutes(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null

  // Supports: "1h 30m", "2h", "90m", "45 min"
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
  // HH:mmZ
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}Z`
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60 * 1000)
}

export function computeEtaSheetLinesFromQuick(
  quick: QuickDispatchMeta,
  now = new Date(),
): EtaSheetLine[] {
  const lines: EtaSheetLine[] = []
  if (!quick.legs.length) return lines

  const baseNow = (() => {
    const first = quick.legs[0]
    // Scheduled: use the provided date (UTC-ish mid-day baseline).
    if (quick.timing === 'scheduled' && first.date) {
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

