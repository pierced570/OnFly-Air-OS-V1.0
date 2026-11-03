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
  sub: string
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
    kts: 270,
    rate: 2400,
    maxNm: 1300,
  },
  {
    name: 'Light jet',
    sub: 'CJ3 · Phenom 300 · fastest for parts',
    kts: 400,
    rate: 3600,
    maxNm: 1900,
  },
  {
    name: 'Mid-size jet',
    sub: 'XLS · Lear 60 · heavier loads, more range',
    kts: 430,
    rate: 5200,
    maxNm: 2600,
  },
] as const

export const PORTAL_SOFT_QUOTE_FINE_PRINT =
  'Soft quote only — one-way, typical market rates incl. repositioning. Not a firm offer. Weather, crew duty and aircraft availability move the number.'

export type SoftQuoteClassResult = {
  name: string
  sub: string
  /** e.g. "$12,400 – $15,400" */
  price: string
  /** e.g. "3h 45m block" */
  block: string
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

function formatBlock(hrs: number): string {
  const h = Math.floor(hrs)
  const m = Math.round((hrs - h) * 60)
  return `${h}h ${m < 10 ? '0' : ''}${m}m block`
}

/** Block time + soft price band for one class at `nm`. */
export function softQuoteClassAtNm(
  cls: SoftQuoteClassConfig,
  nm: number,
): SoftQuoteClassResult {
  const hrs = Math.max(nm / cls.kts + 0.4, 1.5)
  const cost = hrs * cls.rate * 1.2
  const over = nm > cls.maxNm
  return {
    name: cls.name,
    sub: over ? 'Fuel stop likely at this distance' : cls.sub,
    price: `${money(cost * 0.9)} – ${money(cost * 1.12)}`,
    block: formatBlock(hrs),
    opacity: over ? 0.45 : 1,
    overRange: over,
    hrs,
    costLow: round100(cost * 0.9),
    costHigh: round100(cost * 1.12),
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
  if (p.code?.trim()) return p.code.trim().toUpperCase()
  const lat = Number.isFinite(p.lat) ? p.lat.toFixed(1) : '?'
  const lonAbs = Number.isFinite(p.lon) ? Math.abs(p.lon).toFixed(1) : '?'
  return `${lat}°, ${lonAbs}°W`
}

/** Prefill notes when sending a soft quote to the desk for a hard quote. */
export function softQuoteHardNotes(a: SoftQuotePoint, b: SoftQuotePoint): string {
  const q = softQuoteFor(a, b)
  return `Soft quote ${softQuotePointLabel(a)} → ${softQuotePointLabel(b)} (${q.nmLabel} nm) — please send hard quote`
}
