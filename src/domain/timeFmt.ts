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

export function localInputToUtc(
  localIsoOrDateTime: string,
  ianaZone: string,
): string {
  const dt = DateTime.fromISO(localIsoOrDateTime, { zone: ianaZone })
  if (!dt.isValid) throw new Error(`Invalid local datetime: ${localIsoOrDateTime}`)
  return dt.toUTC().toISO()!
}
