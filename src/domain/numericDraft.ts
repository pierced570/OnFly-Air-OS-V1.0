/**
 * Empty-safe numeric draft helpers — keep inputs clearable (no sticky 0/1).
 * Pure TypeScript; parse only when the draft is a complete number.
 */

/** Strip thousands commas; keep digits / one dot. */
export function sanitizeDecimalDraft(raw: string): string {
  return String(raw ?? '').replace(/,/g, '').trim()
}

export function isDecimalDraft(raw: string, integer = false): boolean {
  const v = sanitizeDecimalDraft(raw)
  if (v === '') return true
  return integer ? /^\d*$/.test(v) : /^\d*\.?\d*$/.test(v)
}

/**
 * Parse a draft string to a number, or null when empty / incomplete / invalid.
 * Incomplete drafts like "." or "12." return null so callers do not invent 0.
 */
export function parseDecimalDraft(
  raw: string,
  opts?: { integer?: boolean },
): number | null {
  const v = sanitizeDecimalDraft(raw)
  if (v === '' || v === '.') return null
  if (opts?.integer) {
    if (!/^\d+$/.test(v)) return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.floor(n) : null
  }
  if (!/^\d+\.?\d*$|^\.\d+$/.test(v)) return null
  // Trailing dot is still incomplete for commit, but Number("12.") === 12 —
  // treat trailing-only-dot as incomplete so we don't snap mid-edit.
  if (v.endsWith('.')) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Display value for a controlled numeric field — blank when empty/null (and optionally 0). */
export function formatNumericDisplay(
  value: number | null | undefined,
  opts?: { blankZero?: boolean },
): string {
  if (value == null || !Number.isFinite(Number(value))) return ''
  const n = Number(value)
  if (opts?.blankZero && n === 0) return ''
  return String(n)
}
