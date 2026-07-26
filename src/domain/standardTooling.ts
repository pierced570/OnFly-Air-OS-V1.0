/**
 * OnFly “standard tooling” — default cargo when call notes mention tools/tooling.
 * Shown to operators on trip offers under this name.
 */

export const STANDARD_TOOLING = {
  /** Operator-facing name */
  label: 'standard tooling',
  /** Dims for routing / fit (12×12×12 @ 50 lb) */
  dims_text: '1 piece 12x12x12 @ 50',
  /** Full phrase on offer / payload summary */
  summary: 'standard tooling (12×12×12 @ 50 lb)',
} as const

/** Strip label so dimsParser can read the piece line. */
export function toolingDimsForParse(piecesText: string): string {
  const t = piecesText.trim()
  if (/standard tooling/i.test(t)) {
    return STANDARD_TOOLING.dims_text
  }
  return t
}

export function mentionsTools(text: string): boolean {
  return /\btools?\b|\btooling\b/i.test(text)
}

export function mentionsRoundTrip(text: string): boolean {
  return /\b(round[\s-]?trip|\brt\b|return\s+trip)\b/i.test(text)
}

/** True when notes imply a scheduled (non-ASAP) ready time. */
export function mentionsScheduledTiming(text: string): boolean {
  if (
    /\b(scheduled|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      text,
    )
  ) {
    return true
  }
  if (/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(text)) return true
  if (
    /\b(?:ready|pickup|pick up|need(?:ed)?)\s*(?:at|by)\s*\d/i.test(text)
  ) {
    return true
  }
  return false
}

export function todayLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Build operator-facing cargo/mission line from desk pieces + pax. */
export function operatorMissionSummary(opts: {
  pieces_text: string
  pax_count: number
  cargo_only: boolean
}): string {
  const parts: string[] = []
  if (!opts.cargo_only && opts.pax_count > 0) {
    parts.push(
      `${opts.pax_count} pax${opts.pax_count === 1 ? '' : ''}`,
    )
  }
  const pieces = opts.pieces_text.trim()
  if (pieces) {
    if (
      /standard tooling/i.test(pieces) ||
      /^1 piece 12x12x12 @ 50$/i.test(pieces)
    ) {
      parts.push(STANDARD_TOOLING.summary)
    } else {
      parts.push(pieces)
    }
  }
  return parts.join(' + ') || 'cargo'
}
