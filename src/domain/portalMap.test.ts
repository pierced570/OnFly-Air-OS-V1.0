import { describe, expect, it } from 'vitest'
import portalMapData from '@/data/portalMapData.json'
import {
  MAP_VIEWBOX,
  arcControl,
  arcPathD,
  bezierPoint,
  bezierSubcurve,
  bezierTangent,
  clampLabelX,
  formatClickLabel,
  easeOutCubic,
  formatNmLabel,
  frameMapViewBox,
  greatCircleNm,
  lerpViewBox,
  nextQuotePoints,
  nmToStatute,
  projectLonLat,
  quoteHint,
  resolveMapClick,
  snapToHub,
  telemetryFlipLeft,
  unprojectXY,
  type MapAirport,
  type MapProjection,
} from '@/domain/portalMap'

const projection = portalMapData.us_map.projection as MapProjection
const airports = portalMapData.airports as MapAirport[]

describe('portalMap projection', () => {
  it('projects KSAN near precomputed design coords', () => {
    const ksan = airports.find((a) => a.icao === 'KSAN')!
    const p = projectLonLat(ksan.lon, ksan.lat, projection)
    expect(p.x).toBeCloseTo(ksan.x, 0)
    expect(p.y).toBeCloseTo(ksan.y, 0)
  })

  it('round-trips lon/lat through proj → unproj', () => {
    const lon = -117.1897
    const lat = 32.7336
    const xy = projectLonLat(lon, lat, projection)
    const back = unprojectXY(xy.x, xy.y, projection)
    expect(back.lon).toBeCloseTo(lon, 3)
    expect(back.lat).toBeCloseTo(lat, 3)
  })

  it('keeps lower-48 hubs inside the fit extent band', () => {
    for (const a of airports) {
      expect(a.x).toBeGreaterThan(450)
      expect(a.x).toBeLessThan(1420)
      expect(a.y).toBeGreaterThan(100)
      expect(a.y).toBeLessThan(850)
    }
  })
})

describe('portalMap arcs', () => {
  it('bulges control point toward the top of the screen', () => {
    const a = { x: 500, y: 400 }
    const b = { x: 900, y: 400 }
    const c = arcControl(a, b)
    expect(c.y).toBeLessThan(400)
    expect(c.x).toBeCloseTo(700, 5)
  })

  it('builds a quadratic path string', () => {
    const d = arcPathD({ x: 1, y: 2 }, { x: 5, y: 6 }, { x: 3, y: 0 })
    expect(d).toBe('M1 2 Q 3 0 5 6')
  })

  it('evaluates bezier endpoints and midpoint', () => {
    const a = { x: 0, y: 0 }
    const c = { x: 50, y: -50 }
    const b = { x: 100, y: 0 }
    expect(bezierPoint(a, c, b, 0)).toEqual(a)
    expect(bezierPoint(a, c, b, 1)).toEqual(b)
    const mid = bezierPoint(a, c, b, 0.5)
    expect(mid.x).toBeCloseTo(50)
    expect(mid.y).toBeCloseTo(-25)
  })

  it('sub-curves with De Casteljau from 0 to t', () => {
    const a = { x: 0, y: 0 }
    const c = { x: 50, y: -50 }
    const b = { x: 100, y: 0 }
    const sub = bezierSubcurve(a, c, b, 0.5)
    expect(sub.a).toEqual(a)
    expect(sub.b).toEqual(bezierPoint(a, c, b, 0.5))
    expect(sub.c.x).toBeCloseTo(25)
    expect(sub.c.y).toBeCloseTo(-25)
  })

  it('returns a horizontal tangent at midpoint of symmetric arc', () => {
    const a = { x: 0, y: 0 }
    const c = { x: 50, y: -40 }
    const b = { x: 100, y: 0 }
    const t = bezierTangent(a, c, b, 0.5)
    expect(t.x).toBeGreaterThan(0)
    expect(Math.abs(t.y)).toBeLessThan(1e-9)
  })
})

describe('portalMap click-to-quote', () => {
  it('snaps within 16 design units to a hub', () => {
    const hub = airports.find((a) => a.icao === 'KCAK')!
    const hit = snapToHub({ x: hub.x + 10, y: hub.y - 5 }, airports, 16)
    expect(hit?.icao).toBe('KCAK')
    const miss = snapToHub({ x: hub.x + 40, y: hub.y }, airports, 16)
    expect(miss).toBeNull()
  })

  it('formats lat/lon click labels', () => {
    expect(formatClickLabel(33.4, -79.6)).toBe('33.4°, 79.6°W')
    expect(formatClickLabel(-10.2, 20.5)).toBe('10.2°S, 20.5°E')
  })

  it('computes great-circle NM and statute miles', () => {
    const san = airports.find((a) => a.icao === 'KSAN')!
    const bos = airports.find((a) => a.icao === 'KBOS')!
    const nm = greatCircleNm(san.lat, san.lon, bos.lat, bos.lon)
    expect(nm).toBeGreaterThan(2200)
    expect(nm).toBeLessThan(2700)
    expect(nmToStatute(nm)).toBeCloseTo(nm * 1.1508, 6)
    expect(formatNmLabel(1865)).toBe('1,865 NM')
  })

  it('alternates A → B → new A on successive clicks', () => {
    const a = resolveMapClick(
      { x: airports[0]!.x, y: airports[0]!.y },
      airports,
      projection,
    )
    const b = resolveMapClick(
      { x: airports[1]!.x, y: airports[1]!.y },
      airports,
      projection,
    )
    const step1 = nextQuotePoints({}, a)
    expect(step1.a?.icao).toBe(airports[0]!.icao)
    expect(step1.b).toBeUndefined()
    expect(quoteHint(step1)).toBe('Now click the destination')

    const step2 = nextQuotePoints(step1, b)
    expect(step2.b?.icao).toBe(airports[1]!.icao)
    expect(step2.nm).toBeGreaterThan(0)
    expect(quoteHint(step2)).toBe(
      'Soft quote ready · click again to start over',
    )

    const step3 = nextQuotePoints(step2, a)
    expect(step3.a?.icao).toBe(airports[0]!.icao)
    expect(step3.b).toBeUndefined()
  })

  it('clamps labels and flips telemetry near the right edge', () => {
    expect(clampLabelX(400)).toBe(440)
    expect(clampLabelX(1500)).toBe(1425)
    expect(telemetryFlipLeft(1420)).toBe(true)
    expect(telemetryFlipLeft(1000)).toBe(false)
  })
})

describe('portalMap framing', () => {
  it('exposes the four framing viewBoxes from doc 02', () => {
    expect(MAP_VIEWBOX.loginWide).toBe('455 170 960 600')
    expect(MAP_VIEWBOX.loginPhone).toBe('965 110 415 898')
    expect(MAP_VIEWBOX.portalDesktop).toBe('0 0 1440 900')
  })

  it('frames points into the phone band above the sheet (doc 05)', () => {
    const vb = frameMapViewBox({
      points: [
        { x: 1189.5, y: 396.3 },
        { x: 1316.5, y: 367.9 },
      ],
      screenW: 390,
      screenH: 844,
      bandTop: 110,
      bandBottom: 270,
      pad: 65,
    })
    const [x, y, w, h] = vb.split(/\s+/).map(Number)
    expect(w).toBeGreaterThan(0)
    expect(h).toBeGreaterThan(0)
    expect(Number.isFinite(x)).toBe(true)
    expect(Number.isFinite(y)).toBe(true)
    // Scale so the route fits the band width/height
    expect(w / 390).toBeCloseTo(h / 844, 5)
  })

  it('falls back to portal desktop viewBox with no points', () => {
    expect(
      frameMapViewBox({
        points: [],
        screenW: 390,
        screenH: 844,
        bandTop: 110,
        bandBottom: 370,
      }),
    ).toBe(MAP_VIEWBOX.portalDesktop)
  })

  it('lerps viewBox numbers and eases out', () => {
    expect(lerpViewBox('0 0 100 100', '100 50 200 200', 0.5)).toBe(
      '50 25 150 150',
    )
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})
