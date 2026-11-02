/**
 * Client trips overview — full US dark basemap with gold city twinkles
 * plus lit pins / route for selected shipments.
 */

import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalShipmentPhase,
} from '@/domain/portalTracking'
import { PORTAL_US_CITY_TWINKLES } from '@/domain/portalUsCities'
import { getTrip } from '@/lib/tripStore'

export type PortalOverviewPin = {
  id: string
  phase: PortalShipmentPhase
  selected: boolean
}

type Point = {
  id: string
  lng: number
  lat: number
  kind: 'ac' | 'from' | 'to'
  label: string
  selected: boolean
  live: boolean
}

const US_CENTER: [number, number] = [-97.5, 38.5]
const US_ZOOM = 3.55

function ensureTwinkleStyle(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('onfly-city-twinkle-style')) return
  const style = document.createElement('style')
  style.id = 'onfly-city-twinkle-style'
  style.textContent = `
@keyframes onfly-city-twinkle {
  0%, 100% { opacity: 0.22; transform: scale(0.7); box-shadow: 0 0 0 0 rgba(201,162,39,0); }
  50% { opacity: 1; transform: scale(1.25); box-shadow: 0 0 14px 3px rgba(201,162,39,0.75); }
}
.onfly-city-twinkle {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #E3B341;
  pointer-events: none;
  animation: onfly-city-twinkle 2.6s ease-in-out infinite;
}
`
  document.head.appendChild(style)
}

function cityTwinkleEl(delayMs: number): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'onfly-city-twinkle'
  el.style.animationDelay = `${delayMs}ms`
  return el
}

function pinEl(p: Point): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;'
  const size = p.kind === 'ac' ? 14 : 9
  const color =
    p.kind === 'ac'
      ? p.live
        ? '#C9A227'
        : '#E3B341'
      : p.kind === 'to'
        ? '#2E7D32'
        : '#8a8680'
  const glow = p.selected
    ? '0 0 0 4px rgba(201,162,39,0.55), 0 0 18px rgba(201,162,39,0.85)'
    : p.live
      ? '0 0 0 2px rgba(201,162,39,0.45), 0 0 10px rgba(201,162,39,0.5)'
      : '0 0 0 1px rgba(247,242,227,0.35)'
  const dot = document.createElement('div')
  dot.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:999px',
    'border:2px solid #F7F2E3',
    `background:${color}`,
    `box-shadow:${glow}`,
  ].join(';')
  const tag = document.createElement('div')
  tag.textContent = p.label
  tag.style.cssText = [
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-size:10px',
    'font-weight:700',
    'letter-spacing:0.04em',
    p.selected || p.kind === 'ac' ? 'color:#0C0C0E' : 'color:#F7F2E3',
    p.selected || p.kind === 'ac'
      ? 'background:#C9A227'
      : 'background:rgba(12,12,14,0.88)',
    'border-radius:3px',
    'padding:1px 5px',
    'white-space:nowrap',
  ].join(';')
  wrap.appendChild(dot)
  wrap.appendChild(tag)
  return wrap
}

function collectPoints(pins: PortalOverviewPin[]): Point[] {
  const out: Point[] = []
  for (const pin of pins) {
    const trip = getTrip(pin.id)
    if (!trip) continue
    const view = buildPortalTrackingView(tripToTrackingInput(trip), {
      adsb: null,
    })
    const a = view.aircraft
    const live =
      pin.phase === 'in_flight' ||
      pin.phase === 'on_truck' ||
      trip.state === 'in_progress'
    const fromOk =
      a.fromLat != null &&
      a.fromLon != null &&
      !(a.fromLat === 0 && a.fromLon === 0)
    const toOk =
      a.toLat != null &&
      a.toLon != null &&
      !(a.toLat === 0 && a.toLon === 0)
    const acOk =
      a.lat != null && a.lon != null && !(a.lat === 0 && a.lon === 0)

    if (fromOk) {
      out.push({
        id: pin.id,
        lng: a.fromLon!,
        lat: a.fromLat!,
        kind: 'from',
        label: a.fromIcao || 'ORIG',
        selected: pin.selected,
        live,
      })
    }
    if (toOk) {
      out.push({
        id: pin.id,
        lng: a.toLon!,
        lat: a.toLat!,
        kind: 'to',
        label: a.toIcao || 'DEST',
        selected: pin.selected,
        live,
      })
    }
    if (acOk) {
      out.push({
        id: pin.id,
        lng: a.lon!,
        lat: a.lat!,
        kind: 'ac',
        label: a.tail && a.tail !== '—' ? a.tail : `T-${view.ref}`,
        selected: pin.selected,
        live,
      })
    }
  }
  return out
}

/** Soft great-circle-ish arc between two lon/lat points (Pinterest route glow). */
function arcCoords(
  a: [number, number],
  b: [number, number],
  steps = 28,
): [number, number][] {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const midLng = (lng1 + lng2) / 2
  const midLat = (lat1 + lat2) / 2
  const dist = Math.hypot(lng2 - lng1, lat2 - lat1)
  const bulge = Math.min(8, Math.max(1.2, dist * 0.18))
  const ctrl: [number, number] = [midLng, midLat + bulge]
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([
      u * u * lng1 + 2 * u * t * ctrl[0] + t * t * lng2,
      u * u * lat1 + 2 * u * t * ctrl[1] + t * t * lat2,
    ])
  }
  return out
}

type RouteLineFeature = {
  type: 'Feature'
  properties: Record<string, never>
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

function selectedRouteLine(
  pins: PortalOverviewPin[],
): RouteLineFeature | null {
  const selected = pins.find((p) => p.selected)
  if (!selected) return null
  const trip = getTrip(selected.id)
  if (!trip) return null
  const view = buildPortalTrackingView(tripToTrackingInput(trip), {
    adsb: null,
  })
  const a = view.aircraft
  const anchors: [number, number][] = []
  if (
    a.fromLat != null &&
    a.fromLon != null &&
    !(a.fromLat === 0 && a.fromLon === 0)
  ) {
    anchors.push([a.fromLon, a.fromLat])
  }
  if (a.lat != null && a.lon != null && !(a.lat === 0 && a.lon === 0)) {
    anchors.push([a.lon, a.lat])
  }
  if (
    a.toLat != null &&
    a.toLon != null &&
    !(a.toLat === 0 && a.toLon === 0)
  ) {
    anchors.push([a.toLon, a.toLat])
  }
  if (anchors.length < 2) return null
  const coords: [number, number][] = []
  for (let i = 0; i < anchors.length - 1; i++) {
    const seg = arcCoords(anchors[i]!, anchors[i + 1]!)
    if (i > 0) seg.shift()
    coords.push(...seg)
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  }
}

export function PortalOverviewMap(props: {
  pins: PortalOverviewPin[]
  className?: string
  onSelect?: (id: string) => void
  /** Keep continental US framing even with trip pins. */
  lockUsFrame?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const cityMarkersRef = useRef<maplibregl.Marker[]>([])
  const paintedKeyRef = useRef('')
  const onSelectRef = useRef(props.onSelect)
  onSelectRef.current = props.onSelect

  const points = useMemo(() => collectPoints(props.pins), [props.pins])
  const route = useMemo(() => selectedRouteLine(props.pins), [props.pins])
  const paintKey = useMemo(
    () =>
      [
        points
          .map(
            (p) =>
              `${p.id}:${p.kind}:${p.lng.toFixed(3)},${p.lat.toFixed(3)}:${p.selected ? 1 : 0}`,
          )
          .join('|'),
        route ? JSON.stringify(route.geometry.coordinates) : '',
      ].join('#'),
    [points, route],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    ensureTwinkleStyle()
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap © CARTO',
          },
        },
        layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
      },
      center: US_CENTER,
      zoom: US_ZOOM,
      attributionControl: false,
      interactive: true,
    })
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    )

    map.on('load', () => {
      // Soft gold city twinkles across the US.
      for (const [i, city] of PORTAL_US_CITY_TWINKLES.entries()) {
        const el = cityTwinkleEl((i * 170) % 2800)
        cityMarkersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([city.lon, city.lat])
            .addTo(map),
        )
      }
      map.addSource('portal-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'portal-route-glow',
        type: 'line',
        source: 'portal-route',
        paint: {
          'line-color': '#C9A227',
          'line-width': 8,
          'line-opacity': 0.28,
          'line-blur': 4,
        },
      })
      map.addLayer({
        id: 'portal-route-line',
        type: 'line',
        source: 'portal-route',
        paint: {
          'line-color': '#E3B341',
          'line-width': 3,
          'line-opacity': 0.95,
        },
      })
    })

    mapRef.current = map
    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      for (const m of cityMarkersRef.current) m.remove()
      cityMarkersRef.current = []
      map.remove()
      mapRef.current = null
      paintedKeyRef.current = ''
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (paintKey === paintedKeyRef.current && markersRef.current.length) {
      // Still refresh route source when only selection route changes mid-key.
    }

    const paint = () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []

      const coords: [number, number][] = []
      for (const p of points) {
        const el = pinEl(p)
        el.style.cursor = 'pointer'
        el.style.pointerEvents = 'auto'
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelectRef.current?.(p.id)
        })
        markersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([p.lng, p.lat])
            .addTo(map),
        )
        coords.push([p.lng, p.lat])
      }

      const src = map.getSource('portal-route') as
        | maplibregl.GeoJSONSource
        | undefined
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: route ? [route] : [],
        })
      }

      if (props.lockUsFrame || coords.length === 0) {
        map.easeTo({ center: US_CENTER, zoom: US_ZOOM, duration: 450 })
      } else if (coords.length === 1) {
        map.easeTo({ center: coords[0], zoom: 5.8, duration: 450 })
      } else {
        const bounds = new maplibregl.LngLatBounds(coords[0], coords[0])
        for (const c of coords) bounds.extend(c)
        map.fitBounds(bounds, {
          padding: { top: 72, bottom: 72, left: 320, right: 72 },
          maxZoom: 7.5,
          duration: 450,
        })
      }
      paintedKeyRef.current = paintKey
    }

    if (map.loaded()) paint()
    else map.once('load', paint)
  }, [paintKey, points, route, props.lockUsFrame])

  return (
    <div
      ref={containerRef}
      className={
        props.className ??
        'h-full min-h-[28rem] w-full overflow-hidden bg-[#141414]'
      }
    />
  )
}
