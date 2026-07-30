/**
 * Passenger rows collected on a trip (often late — post booking / waterfall).
 */

export type TripPassenger = {
  id: string
  name: string
  /** Estimated weight lb — optional until known. */
  weight_lbs: number | ''
  /** yyyy-mm-dd — optional until known. */
  dob: string
}

export function emptyTripPassenger(
  partial?: Partial<TripPassenger>,
): TripPassenger {
  return {
    id: crypto.randomUUID(),
    name: '',
    weight_lbs: '',
    dob: '',
    ...partial,
  }
}

export function normalizeTripPassengers(
  rows: unknown,
): TripPassenger[] {
  if (!Array.isArray(rows)) return []
  return rows.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const weightRaw = r.weight_lbs
    const weight_lbs =
      weightRaw === '' || weightRaw == null
        ? ('' as const)
        : Number(weightRaw)
    return {
      id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
      name: String(r.name ?? '').trim(),
      weight_lbs:
        weight_lbs === '' || Number.isNaN(Number(weight_lbs))
          ? ''
          : Number(weight_lbs),
      dob: String(r.dob ?? '').trim(),
    }
  })
}

export function tripPassengerNames(rows: TripPassenger[]): string[] {
  return rows.map((p) => p.name.trim()).filter(Boolean)
}

/** Completed enough for manifests / portal display. */
export function tripPassengerFilled(p: TripPassenger): boolean {
  return Boolean(p.name.trim())
}
