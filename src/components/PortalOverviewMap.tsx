/**
 * Client dashboard overview map — lit pins for origin / dest / aircraft
 * across active (and selected) shipments. Cream/gold on dark basemap.
 */

import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalShipmentPhase,
} from '@/domain/portalTracking'
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

export function PortalOverviewMap(props: {
  pins: PortalOverviewPin[]
  className?: string
  onSelect?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const paintedKeyRef = useRef('')

  const points = useMemo(() => collectPoints(props.pins), [props.pins])
  const paintKey = useMemo(
    () =>
      points
        .map(
          (p) =>
            `${p.id}:${p.kind}:${p.lng.toFixed(3)},${p.lat.toFixed(3)}:${p.selected ? 1 : 0}`,
        )
        .join('|'),
    [points],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
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
      center: [-95.5, 38.5],
      zoom: 3.4,
      attributionControl: false,
      interactive: true,
    })
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    )
    mapRef.current = map
    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      map.remove()
      mapRef.current = null
      paintedKeyRef.current = ''
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (paintKey === paintedKeyRef.current && markersRef.current.length) return

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
          props.onSelect?.(p.id)
        })
        markersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([p.lng, p.lat])
            .addTo(map),
        )
        coords.push([p.lng, p.lat])
      }

      if (coords.length === 1) {
        map.easeTo({ center: coords[0], zoom: 6.5, duration: 450 })
      } else if (coords.length > 1) {
        const bounds = new maplibregl.LngLatBounds(coords[0], coords[0])
        for (const c of coords) bounds.extend(c)
        map.fitBounds(bounds, {
          padding: { top: 48, bottom: 48, left: 40, right: 40 },
          maxZoom: 8.5,
          duration: 450,
        })
      }
      paintedKeyRef.current = paintKey
    }

    if (map.loaded()) paint()
    else map.once('load', paint)
  }, [paintKey, points, props])

  return (
    <div
      ref={containerRef}
      className={
        props.className ??
        'h-64 w-full overflow-hidden rounded-2xl border border-cream/10 bg-[#141414] sm:h-80'
      }
    />
  )
}
