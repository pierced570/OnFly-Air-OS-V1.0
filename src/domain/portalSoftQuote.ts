/**
 * Soft-quote class model for the glass portal (doc 04).
 * Tunable rates/speeds in one place so ops can adjust without UI edits.
 * Pure TypeScript — no React / Supabase.
 */

import { haversineNm } from '@/domain/geo'
import { NM_TO_STATUTE } from '@/domain/portalMap'

/** Aircraft class band for map soft quotes (doc 04). */
export type SoftQuoteClassConfig = {
  name: string
  /** Supporting line under the class (fallback when over range). */
  sub: string
  /** Gold pill on the rough-estimate card e.g. "Fastest for parts". */
  badge: string
  /** Example types shown under the card e.g. "CJ3 · Phenom 300". */
  examples: string
  /** Payload band e.g. "≤ 1,200 lb". */
  payload: string
  /** Ready-to-launch band e.g. "~2–3 h". */
  ready: string
  kts: number
  /** $/hr market rate used in the soft model. */
  rate: number
  /** One-way range before a fuel stop is likely. */
  maxNm: number
}

/**
 * Soft-quote classes — ops-tunable.
 * hrs = max(nm/kts + 0.4, 1.5); cost = hrs * rate * 1.2; range ±10/12%.
 */
export const PORTAL_SOFT_QUOTE_CLASSES: readonly SoftQuoteClassConfig[] = [
  {
    name: 'Turboprop',
    sub: 'King Air · PC-12 · up to ~1,000 lb',
    badge: 'Best value',
    examples: 'King Air 350 · PC-12',
    payload: '≤ 1,000 lb',
    ready: '~2–3 h',
    kts: 270,
    rate: 2400,
    maxNm: 1300,
  },
  {
    name: 'Light jet',
    sub: 'CJ3 · Phenom 300 · fastest for parts',
    badge: 'Fastest for parts',
    examples: 'CJ3 · Phenom 300',
    payload: '≤ 1,200 lb',
    ready: '~2–3 h',
    kts: 400,
    rate: 3600,
    maxNm: 1900,
  },
  {
    name: 'Mid-size jet',
    sub: 'XLS · Lear 60 · heavier loads, more range',
    badge: 'More range',
    examples: 'XLS · Learjet 60',
    payload: '≤ 2,000 lb',
    ready: '~3–4 h',
    kts: 430,
    rate: 5200,
    maxNm: 2600,
  },
] as const

export const PORTAL_SOFT_QUOTE_FINE_PRINT =
  'Rough, typical market rates — not a firm offer. You approve the hard quote from a vetted Part 135 carrier before anything is booked.'

export type SoftQuoteClassResult = {
  name: string
  sub: string
  badge: string
  examples: string
  payload: string
  ready: string
  kts: number
  /** e.g. "$12,400 – $15,400" */
  price: string
  /** Compact CTA band e.g. "$8.3k–$10.4k" */
  priceShort: string
  /** e.g. "3h 45m block" */
  block: string
  /** Block duration without the word "block" e.g. "2h 08m". */
  blockShort: string
  /** 1 normally; 0.45 when over maxNm. */
  opacity: number
  overRange: boolean
  hrs: number
  costLow: number
  costHigh: number
}

export type SoftQuoteResult = {
  nm: number
  sm: number
  nmLabel: string
  smLabel: string
  classes: SoftQuoteClassResult[]
}

export type SoftQuotePoint = {
  lat: number
  lon: number
  code?: string | null
  city?: string | null
}

function round100(n: number): number {
  return Math.round(n / 100) * 100
}

function money(v: number): string {
  return `$${round100(v).toLocaleString('en-US')}`
}

/** Compact money for CTA: $8.3k–$10.4k */
export function formatSoftQuotePriceShort(low: number, high: number): string {
  const fmt = (n: number) => {
    if (n >= 1000) {
      const k = n / 1000
      // One decimal under $100k so $10.4k stays distinct from $10k.
      const s =
        k >= 100
          ? k.toFixed(0)
          : Number.isInteger(k)
            ? String(k)
            : k.toFixed(1)
      return `$${s}k`
    }
    return `$${n}`
  }
  return `${fmt(low)}–${fmt(high)}`
}

function formatBlockShort(hrs: number): string {
  const h = Math.floor(hrs)
  const m = Math.round((hrs - h) * 60)
  return `${h}h ${m < 10 ? '0' : ''}${m}m`
}

function formatBlock(hrs: number): string {
  return `${formatBlockShort(hrs)} block`
}

/** Scale one-way soft band for round-trip display (~1.85×). */
export function softQuoteRoundTripCosts(
  oneWay: SoftQuoteClassResult,
): { costLow: number; costHigh: number; price: string } {
  const costLow = round100(oneWay.costLow * 1.85)
  const costHigh = round100(oneWay.costHigh * 1.85)
  return {
    costLow,
    costHigh,
    price: `${money(costLow)} – ${money(costHigh)}`,
  }
}

/** Footer summary under the desktop rough-estimate cards. */
export function softQuoteSelectionSummary(
  cls: SoftQuoteClassResult,
  opts?: { roundTrip?: boolean },
): string {
  const band = opts?.roundTrip
    ? softQuoteRoundTripCosts(cls).price
    : cls.price.replace(' – ', ' – ')
  return `${cls.name} ${band} · wheels up ${cls.ready} · lands ~${cls.blockShort} later`
}

/** Block time + soft price band for one class at `nm`. */
export function softQuoteClassAtNm(
  cls: SoftQuoteClassConfig,
  nm: number,
): SoftQuoteClassResult {
  const hrs = Math.max(nm / cls.kts + 0.4, 1.5)
  const cost = hrs * cls.rate * 1.2
  const over = nm > cls.maxNm
  const costLow = round100(cost * 0.9)
  const costHigh = round100(cost * 1.12)
  return {
    name: cls.name,
    sub: over ? 'Fuel stop likely at this distance' : cls.sub,
    badge: cls.badge,
    examples: cls.examples,
    payload: cls.payload,
    ready: cls.ready,
    kts: cls.kts,
    price: `${money(costLow)} – ${money(costHigh)}`,
    priceShort: formatSoftQuotePriceShort(costLow, costHigh),
    block: formatBlock(hrs),
    blockShort: formatBlockShort(hrs),
    opacity: over ? 0.45 : 1,
    overRange: over,
    hrs,
    costLow,
    costHigh,
  }
}

/** Soft quote between two lat/lon points (doc 04 quoteFor). */
export function softQuoteFor(
  a: SoftQuotePoint,
  b: SoftQuotePoint,
  classes: readonly SoftQuoteClassConfig[] = PORTAL_SOFT_QUOTE_CLASSES,
): SoftQuoteResult {
  const nm = haversineNm(a.lat, a.lon, b.lat, b.lon)
  const sm = nm * NM_TO_STATUTE
  return {
    nm,
    sm,
    nmLabel: Math.round(nm).toLocaleString('en-US'),
    smLabel: Math.round(sm).toLocaleString('en-US'),
    classes: classes.map((c) => softQuoteClassAtNm(c, nm)),
  }
}

/** Display label for a soft-quote / map pick point. */
export function softQuotePointLabel(p: SoftQuotePoint): string {
  const code = p.code?.trim().toUpperCase()
  const city = p.city?.trim()
  if (code && city) return `${code} · ${city}`
  if (code) return code
  const lat = Number.isFinite(p.lat) ? p.lat.toFixed(1) : '?'
  const lonAbs = Number.isFinite(p.lon) ? Math.abs(p.lon).toFixed(1) : '?'
  const lonHem = Number.isFinite(p.lon) && p.lon >= 0 ? 'E' : 'W'
  return `${lat}°, ${lonAbs}°${lonHem}`
}

/** Short ICAO (or city) for rough-estimate headers. */
export function softQuotePointCode(p: SoftQuotePoint): string {
  const code = p.code?.trim().toUpperCase()
  if (code) return code
  return softQuotePointLabel(p)
}

/** Prefill notes when sending a soft quote to the desk for a hard quote. */
export function softQuoteHardNotes(
  a: SoftQuotePoint,
  b: SoftQuotePoint,
  preferredClass?: string | null,
): string {
  const q = softQuoteFor(a, b)
  const cls = preferredClass?.trim()
  const classBit = cls ? ` · prefer ${cls}` : ''
  return `Soft quote ${softQuotePointLabel(a)} → ${softQuotePointLabel(b)} (${q.nmLabel} nm)${classBit} — please send hard quote`
}

/** CTA label for the selected rough-estimate class. */
export function softQuoteBookCta(cls: SoftQuoteClassResult): string {
  return `Book ${cls.name.toLowerCase()} · ${cls.priceShort}`
}
