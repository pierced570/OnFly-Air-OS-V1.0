/**
 * Aircraft registry / tail helpers — pure.
 */

/** Reject desk placeholders that would poison ADS-B + portal tracking. */
const PLACEHOLDER_TAIL =
  /^(tbd|tba|tba\/tbd|unknown|n\/a|na|none|pending|nil|null|-|—|–)$/i

/**
 * True when a string is usable as an assigned tail (not blank / TBD).
 * Accepts N-numbers and other short registry marks.
 */
export function isAssignableAircraftTail(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim().toUpperCase()
  if (t.length < 2) return false
  if (PLACEHOLDER_TAIL.test(t)) return false
  // Strip leading N for length check but keep flexible for foreign regs.
  if (!/^[A-Z0-9-]+$/.test(t)) return false
  return t.length >= 2 && t.length <= 10
}

/** Normalize for storage / ADS-B queries. */
export function normalizeAircraftTail(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}
