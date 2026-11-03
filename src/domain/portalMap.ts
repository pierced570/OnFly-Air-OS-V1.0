/**
 * Portal MapBackdrop math — Albers projection, arc geometry, click-to-quote.
 * Pure TypeScript (no React / Supabase). Geometry constants live in
 * `src/data/portalMapData.json` (doc 02 / 02b).
 */

import { haversineNm } from '@/domain/geo'

/** Statute miles per nautical mile (doc 02). */
export const NM_TO_STATUTE = 1.1508

export type MapPoint = { x: number; y: number }

export type MapAirport = {
  icao: string
  city: string
  lat: number
  lon: number
  x: number
  y: number
}

export type MapProjection = {
  k: number
  tx: number
  ty: number
  n: number
  c: number
  r0: number
}

/** Design-space framing presets from doc 02. */
export const MAP_VIEWBOX = {
  loginWide: '455 170 960 600',
  loginPhone: '965 110 415 898',
  portalDesktop: '0 0 1440 900',
} as const

export const MAP_DESIGN = { width: 1440, height: 900 } as const

const D = Math.PI / 180

/** Albers conic equal-area forward: lon/lat → design x/y. */
export function projectLonLat(
  lon: number,
  lat: number,
  p: MapProjection,
): MapPoint {
  const { k, tx, ty, n, c, r0 } = p
  const x = (lon + 96) * D * n
  const y = lat * D
  const r = Math.sqrt(c - 2 * n * Math.sin(y)) / n
  return {
    x: k * r * Math.sin(x) + tx,
    y: ty - k * (r0 - r * Math.cos(x)),
  }
}

/** Inverse: design x/y → [lon, lat]. */
export function unprojectXY(
  px: number,
  py: number,
  p: MapProjection,
): { lon: number; lat: number } {
  const { k, tx, ty, n, c, r0 } = p
  const x = (px - tx) / k
  const y = (ty - py) / k
  const r0y = r0 - y
  let l = Math.atan2(x, Math.abs(r0y)) * Math.sign(r0y)
  if (r0y * n < 0) l -= Math.PI * Math.sign(x) * Math.sign(r0y)
  const lat = Math.asin((c - (x * x + r0y * r0y) * n * n) / (2 * n))
  return { lon: l / n / D - 96, lat: lat / D }
}

/**
 * Quadratic Bézier control for ambient / quote arcs.
 * Chord midpoint pushed perpendicular by min(L*0.18, 70), always toward
 * the top of the screen (flip the normal if its y > 0).
 */
export function arcControl(a: MapPoint, b: MapPoint): MapPoint {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = Math.hypot(dx, dy) || 1
  let nx = -dy / L
  let ny = dx / L
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  const bulge = Math.min(L * 0.18, 70)
  return {
    x: (a.x + b.x) / 2 + nx * bulge,
    y: (a.y + b.y) / 2 + ny * bulge,
  }
}

export function arcPathD(a: MapPoint, b: MapPoint, c?: MapPoint): string {
  const ctrl = c ?? arcControl(a, b)
  return `M${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`
}

/** Point on quadratic Bézier at t ∈ [0,1]. */
export function bezierPoint(
  a: MapPoint,
  c: MapPoint,
  b: MapPoint,
  t: number,
): MapPoint {
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  }
}

/** Tangent (derivative) of quadratic Bézier at t — for plane rotate. */
export function bezierTangent(
  a: MapPoint,
  c: MapPoint,
  b: MapPoint,
  t: number,
): MapPoint {
  return {
    x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x),
    y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y),
  }
}

/**
 * De Casteljau sub-curve from 0 → t (flown portion of selected route).
 * Returns start, control, end for the truncated quadratic.
 */
export function bezierSubcurve(
  a: MapPoint,
  c: MapPoint,
  b: MapPoint,
  t: number,
): { a: MapPoint; c: MapPoint; b: MapPoint } {
  const c1 = {
    x: a.x + t * (c.x - a.x),
    y: a.y + t * (c.y - a.y),
  }
  const end = bezierPoint(a, c, b, t)
  return { a, c: c1, b: end }
}

export function greatCircleNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return haversineNm(lat1, lon1, lat2, lon2)
}

export function nmToStatute(nm: number): number {
  return nm * NM_TO_STATUTE
}

/** Soft-quote distance label, e.g. "1,865 NM". */
export function formatNmLabel(nm: number): string {
  const rounded = Math.round(nm)
  return `${rounded.toLocaleString('en-US')} NM`
}

/**
 * Lat/lon label for a non-hub click: `33.4°, 79.6°W`.
 * Lon is shown absolute with E/W; lat with optional S.
 */
export function formatClickLabel(lat: number, lon: number): string {
  const latAbs = Math.abs(lat).toFixed(1)
  const lonAbs = Math.abs(lon).toFixed(1)
  const latHem = lat < 0 ? 'S' : ''
  const lonHem = lon < 0 ? 'W' : 'E'
  const latPart = latHem ? `${latAbs}°${latHem}` : `${latAbs}°`
  return `${latPart}, ${lonAbs}°${lonHem}`
}

export function formatHubLabel(airport: MapAirport): string {
  return `${airport.icao} ${airport.city.toUpperCase()}`
}

/** Nearest hub within `threshold` design units, or null. */
export function snapToHub(
  pt: MapPoint,
  hubs: readonly MapAirport[],
  threshold = 16,
): MapAirport | null {
  let best: MapAirport | null = null
  let bestD = threshold
  for (const hub of hubs) {
    const d = Math.hypot(hub.x - pt.x, hub.y - pt.y)
    if (d <= bestD) {
      bestD = d
      best = hub
    }
  }
  return best
}

export type QuoteClickPoint = {
  x: number
  y: number
  lat: number
  lon: number
  icao?: string
  label: string
}

/** Resolve a design-space click into a quote point (snap or lat/lon). */
export function resolveMapClick(
  pt: MapPoint,
  hubs: readonly MapAirport[],
  projection: MapProjection,
  snapThreshold = 16,
): QuoteClickPoint {
  const hub = snapToHub(pt, hubs, snapThreshold)
  if (hub) {
    return {
      x: hub.x,
      y: hub.y,
      lat: hub.lat,
      lon: hub.lon,
      icao: hub.icao,
      label: hub.icao,
    }
  }
  const { lat, lon } = unprojectXY(pt.x, pt.y, projection)
  return {
    x: pt.x,
    y: pt.y,
    lat,
    lon,
    label: formatClickLabel(lat, lon),
  }
}

/**
 * Click-to-quote alternation:
 * 1st → A (clears B), 2nd → B, 3rd → new A.
 */
export function nextQuotePoints(
  current: { a?: QuoteClickPoint; b?: QuoteClickPoint },
  click: QuoteClickPoint,
): { a?: QuoteClickPoint; b?: QuoteClickPoint; nm?: number } {
  if (!current.a || current.b) {
    return { a: click, b: undefined, nm: undefined }
  }
  const nm = greatCircleNm(current.a.lat, current.a.lon, click.lat, click.lon)
  return { a: current.a, b: click, nm }
}

export type QuoteHint =
  | 'Click any two points for a soft quote'
  | 'Now click the destination'
  | 'Soft quote ready · click again to start over'

export function quoteHint(points: {
  a?: unknown
  b?: unknown
}): QuoteHint {
  if (!points.a) return 'Click any two points for a soft quote'
  if (!points.b) return 'Now click the destination'
  return 'Soft quote ready · click again to start over'
}

/** Clamp endpoint label x into the portal band. */
export function clampLabelX(x: number, min = 440, max = 1425): number {
  return Math.min(max, Math.max(min, x))
}

/** Flip telemetry tag to the left when it would cross the right edge. */
export function telemetryFlipLeft(x: number, edge = 1425): boolean {
  return x + 14 > edge
}

/** Design-space points used to frame the phone map band (doc 05). */
export type MapFramePoint = { x: number; y: number }

/**
 * Fit design-space points into the visible band above the phone sheet.
 * `band = [top, bottom]` and `W,H` are screen px; pad is design-units.
 * Returns a viewBox string `minX minY width height`.
 */
export function frameMapViewBox(input: {
  points: readonly MapFramePoint[]
  screenW: number
  screenH: number
  bandTop: number
  bandBottom: number
  pad?: number
}): string {
  const W = Math.max(1, input.screenW)
  const H = Math.max(1, input.screenH)
  const top = input.bandTop
  const bottom = Math.max(top + 1, input.bandBottom)
  const pad = input.pad ?? 65
  const pts = input.points
  if (!pts.length) {
    return MAP_VIEWBOX.portalDesktop
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const s = Math.max(
    (maxX - minX + 2 * pad) / W,
    (maxY - minY + 2 * pad) / (bottom - top),
  )
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const midY = top + (bottom - top) / 2
  const vbX = cx - (W * s) / 2
  const vbY = cy - midY * s
  return `${vbX} ${vbY} ${W * s} ${H * s}`
}

/** Interpolate four viewBox numbers over t ∈ [0,1]. */
export function lerpViewBox(from: string, to: string, t: number): string {
  const a = from.trim().split(/\s+/).map(Number)
  const b = to.trim().split(/\s+/).map(Number)
  if (a.length !== 4 || b.length !== 4 || a.some((n) => !Number.isFinite(n))) {
    return t < 1 ? from : to
  }
  const u = Math.min(1, Math.max(0, t))
  return a.map((n, i) => n + ((b[i] ?? n) - n) * u).join(' ')
}

/** Ease-out for 450ms viewBox transitions (doc 05). */
export function easeOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t))
  return 1 - (1 - u) ** 3
}
