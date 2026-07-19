import { DateTime } from 'luxon'

/** Format UTC ISO as local HH:mm z + Zulu for a stop's IANA zone. */
export function formatStopLocal(
  utcIso: string,
  ianaZone: string,
): { local: string; zulu: string; zone: string } {
  const utc = DateTime.fromISO(utcIso, { zone: 'utc' })
  const local = utc.setZone(ianaZone || 'UTC')
  return {
    local: local.toFormat('HH:mm ZZZZ'),
    zulu: utc.toFormat("HH:mm 'Z'"),
    zone: ianaZone,
  }
}

/**
 * Dispatcher display: Zulu first, stop-local second.
 * Cross-midnight vs a reference day → `+1d` / `−1d` chip.
 */
export function formatZuluLocal(
  utcIso: string,
  ianaZone: string,
  opts?: { refUtcIso?: string },
): {
  zulu: string
  local: string
  zone: string
  dayChip: string | null
  display: string
} {
  const utc = DateTime.fromISO(utcIso, { zone: 'utc' })
  const local = utc.setZone(ianaZone || 'UTC')
  const zulu = utc.toFormat("HHmm'Z'")
  const localStr = local.toFormat('h:mm a ZZZZ')
  let dayChip: string | null = null
  if (opts?.refUtcIso) {
    const refLocal = DateTime.fromISO(opts.refUtcIso, { zone: 'utc' }).setZone(
      ianaZone || 'UTC',
    )
    const dayDiff = Math.round(local.startOf('day').diff(refLocal.startOf('day'), 'days').days)
    if (dayDiff > 0) dayChip = `+${dayDiff}d`
    else if (dayDiff < 0) dayChip = `${dayDiff}d`
  }
  const display = dayChip
    ? `${zulu} / ${localStr} (${dayChip})`
    : `${zulu} / ${localStr}`
  return { zulu, local: localStr, zone: ianaZone || 'UTC', dayChip, display }
}

/** Client docs: stop-local prominent, Zulu small. */
export function formatClientLocal(
  utcIso: string,
  ianaZone: string,
): { local: string; zulu: string; display: string } {
  const { local, zulu } = formatStopLocal(utcIso, ianaZone)
  return {
    local,
    zulu,
    display: `${local} (${zulu})`,
  }
}

export function formatDurationMin(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h <= 0) return `0:${String(r).padStart(2, '0')}`
  return `${h}:${String(r).padStart(2, '0')}`
}

export function parseDurationInput(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  const clock = /^(\d+):(\d{1,2})$/.exec(s)
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2])
  }
  if (/^\d+$/.test(s)) return Number(s)
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g
  let total = 0
  let matched = false
  for (;;) {
    const m = re.exec(s)
    if (!m) break
    matched = true
    const value = Number(m[1])
    const unit = m[2]!
    if (!Number.isFinite(value)) continue
    if (unit.startsWith('h')) total += value * 60
    else total += value
  }
  if (!matched || !Number.isFinite(total)) return null
  return Math.round(total)
}

export function localInputToUtc(
  localIsoOrDateTime: string,
  ianaZone: string,
): string {
  const dt = DateTime.fromISO(localIsoOrDateTime, { zone: ianaZone })
  if (!dt.isValid) throw new Error(`Invalid local datetime: ${localIsoOrDateTime}`)
  return dt.toUTC().toISO()!
}
