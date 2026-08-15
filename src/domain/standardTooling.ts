/**
 * OnFly “standard tooling” — default cargo when call notes mention tools/tooling.
 * Desk UI labels this block “Standard cargo” (L/W/H + weight); operators still
 * see “standard tooling” on trip offers until the parts collection ships.
 */

import { composeDimsLine, parseDimsTriple } from '@/domain/dimsParser'

export const STANDARD_TOOLING = {
  /** Desk / parse name (pieces text) */
  label: 'standard tooling',
  /** Desk section label */
  ui_label: 'Standard cargo',
  /** Dims for routing / fit (12×12×12 @ 75 lb) */
  dims_text: '1 piece 12x12x12 @ 75',
  /** Full phrase on offer / payload summary (desk + historical) */
  summary: 'standard tooling (12×12×12 @ 75 lb)',
  /**
   * Operator trip-offer cargo line when nothing was entered —
   * assumed standard small cargo/tools with known dims + weight.
   */
  operator_assumed: 'standard small cargo/tools (12×12×12 @ 75 lb)',
} as const

/** Desk L / W / H / weight boxes (inches + lb). */
export type StandardCargoDims = {
  length: string
  width: string
  height: string
  weight: string
}

export const STANDARD_CARGO_DEFAULTS: StandardCargoDims = {
  length: '12',
  width: '12',
  height: '12',
  weight: '75',
}

/** Strip label so dimsParser can read the piece line. */
export function toolingDimsForParse(piecesText: string): string {
  const t = piecesText.trim()
  if (/standard tooling/i.test(t)) {
    return STANDARD_TOOLING.dims_text
  }
  return t
}

export function parseStandardCargoDims(piecesText: string): StandardCargoDims {
  const t = parseDimsTriple(toolingDimsForParse(piecesText))
  return {
    length: t.l,
    width: t.w,
    height: t.h,
    weight: t.weight,
  }
}

export function composeStandardCargoDims(d: StandardCargoDims): string {
  const line = composeDimsLine({
    count: 1,
    l: d.length,
    w: d.width,
    h: d.height,
    weightLbs: d.weight.trim() ? Number(d.weight) : null,
  })
  if (
    d.length === STANDARD_CARGO_DEFAULTS.length &&
    d.width === STANDARD_CARGO_DEFAULTS.width &&
    d.height === STANDARD_CARGO_DEFAULTS.height &&
    d.weight === STANDARD_CARGO_DEFAULTS.weight
  ) {
    return `${STANDARD_TOOLING.label} ${STANDARD_TOOLING.dims_text}`
  }
  return line
}

/** Pieces line for desk when dispatcher leaves Standard cargo blank. */
export function standardCargoPiecesText(): string {
  return composeStandardCargoDims(STANDARD_CARGO_DEFAULTS)
}

/**
 * True when Standard cargo boxes are blank / unusable for routing —
 * dispatcher left the defaults as placeholders only.
 */
export function needsStandardCargoAutofill(piecesText: string): boolean {
  const t = piecesText.trim()
  if (!t) return true
  // Label alone without dims still needs the fixed piece line.
  if (/^standard tooling$/i.test(t)) return true
  return false
}

export function isStandardToolingPieces(piecesText: string): boolean {
  const t = piecesText.trim()
  if (!t) return false
  if (/standard tooling/i.test(t)) return true
  const d = parseStandardCargoDims(t)
  return (
    d.length === STANDARD_CARGO_DEFAULTS.length &&
    d.width === STANDARD_CARGO_DEFAULTS.width &&
    d.height === STANDARD_CARGO_DEFAULTS.height &&
    d.weight === STANDARD_CARGO_DEFAULTS.weight
  )
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
    if (isStandardToolingPieces(pieces)) {
      parts.push(STANDARD_TOOLING.summary)
    } else {
      parts.push(pieces)
    }
  } else {
    // Nothing entered → assume standard small cargo/tools with dims + weight.
    parts.push(STANDARD_TOOLING.operator_assumed)
  }
  return parts.join(' + ')
}
