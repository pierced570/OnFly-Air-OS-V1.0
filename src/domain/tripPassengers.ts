/**
 * Passenger rows collected on a trip (often late — post booking via portal).
 */

export type TripPassenger = {
  id: string
  /** Display / legacy full name — kept in sync from first + last. */
  name: string
  first_name: string
  last_name: string
  /** Estimated weight lb — optional until known. */
  weight_lbs: number | ''
  /** yyyy-mm-dd — optional until known. */
  dob: string
}

/** Client-entered cargo details on the tracking portal. */
export type TripPortalCargoDetails = {
  /** Free-text dims e.g. 48×40×36 in · 2 pcs */
  dims: string
  /** Total cargo weight lb — optional until known. */
  total_weight_lbs: number | ''
}

export function emptyTripPassenger(
  partial?: Partial<TripPassenger>,
): TripPassenger {
  const legacy = String(partial?.name ?? '').trim()
  const split = splitFullName(legacy)
  const first_name = String(partial?.first_name ?? split.first).trim()
  const last_name = String(partial?.last_name ?? split.last).trim()
  return {
    id: partial?.id && String(partial.id) ? String(partial.id) : crypto.randomUUID(),
    first_name,
    last_name,
    name: composePassengerName(first_name, last_name) || legacy,
    weight_lbs: partial?.weight_lbs ?? '',
    dob: String(partial?.dob ?? '').trim(),
  }
}

export function emptyTripPortalCargoDetails(
  partial?: Partial<TripPortalCargoDetails>,
): TripPortalCargoDetails {
  return {
    dims: '',
    total_weight_lbs: '',
    ...partial,
  }
}

export function composePassengerName(
  first: string,
  last: string,
): string {
  return [first.trim(), last.trim()].filter(Boolean).join(' ')
}

export function splitFullName(full: string): { first: string; last: string } {
  const t = full.trim().replace(/\s+/g, ' ')
  if (!t) return { first: '', last: '' }
  const i = t.indexOf(' ')
  if (i < 0) return { first: t, last: '' }
  return { first: t.slice(0, i), last: t.slice(i + 1).trim() }
}

export function normalizeTripPassengers(rows: unknown): TripPassenger[] {
  if (!Array.isArray(rows)) return []
  return rows.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const weightRaw = r.weight_lbs
    const weight_lbs =
      weightRaw === '' || weightRaw == null
        ? ('' as const)
        : Number(weightRaw)
    let first_name = String(r.first_name ?? '').trim()
    let last_name = String(r.last_name ?? '').trim()
    const legacyName = String(r.name ?? '').trim()
    if (!first_name && !last_name && legacyName) {
      const split = splitFullName(legacyName)
      first_name = split.first
      last_name = split.last
    }
    const name =
      composePassengerName(first_name, last_name) || legacyName
    return {
      id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
      first_name,
      last_name,
      name,
      weight_lbs:
        weight_lbs === '' || Number.isNaN(Number(weight_lbs))
          ? ''
          : Number(weight_lbs),
      dob: String(r.dob ?? '').trim(),
    }
  })
}

export function normalizeTripPortalCargoDetails(
  raw: unknown,
): TripPortalCargoDetails | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const dims = String(r.dims ?? '').trim()
  const weightRaw = r.total_weight_lbs
  const total_weight_lbs =
    weightRaw === '' || weightRaw == null
      ? ('' as const)
      : Number(weightRaw)
  const weight =
    total_weight_lbs === '' || Number.isNaN(Number(total_weight_lbs))
      ? ('' as const)
      : Number(total_weight_lbs)
  if (!dims && weight === '') return null
  return { dims, total_weight_lbs: weight }
}

export function tripPassengerNames(rows: TripPassenger[]): string[] {
  return rows
    .map((p) => p.name.trim() || composePassengerName(p.first_name, p.last_name))
    .filter(Boolean)
}

/** Completed enough for manifests / portal display. */
export function tripPassengerFilled(p: TripPassenger): boolean {
  return Boolean(
    p.name.trim() ||
      p.first_name.trim() ||
      p.last_name.trim(),
  )
}
