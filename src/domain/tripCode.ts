/**
 * Internal trip codes: 2 letters + 3 digits (e.g. AB123).
 * Unique across the desk session / persisted trips.
 */

/** Skip I/O to avoid lookalikes with 1/0. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export function isValidTripCode(code: string): boolean {
  return /^[A-Z]{2}\d{3}$/.test(code.trim().toUpperCase())
}

export function normalizeTripCode(code: string): string {
  return code.trim().toUpperCase()
}

/** Allocate a unique AA000-style code not in `existing`. */
export function generateTripCode(existing: Iterable<string>): string {
  const used = new Set(
    [...existing].map((c) => normalizeTripCode(c)).filter(isValidTripCode),
  )
  for (let attempt = 0; attempt < 2000; attempt++) {
    const a = LETTERS[Math.floor(Math.random() * LETTERS.length)]!
    const b = LETTERS[Math.floor(Math.random() * LETTERS.length)]!
    const n = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    const code = `${a}${b}${n}`
    if (!used.has(code)) return code
  }
  throw new Error('Could not allocate unique trip code')
}
