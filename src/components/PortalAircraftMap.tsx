/**
 * Client-portal aircraft map — cream/dark track view keyed to trip tail.
 * Origin → dest route, live (or ETA-inferred) aircraft, ICAO labels.
 */

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { TrackingAircraftPosition } from '@/domain/portalTracking'

const PHASE_COLOR: Record<TrackingAircraftPosition['phase'], string> = {
  airborne: '#C9A227',
  on_ground: '#2E7D32',
  positioning: '#C9A227',
  unknown: '#8a8680',
}

function airportEl(label: string, kind: 'from' | 'to'): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:2px',
    'pointer-events:none',
  ].join(';')
  const dot = document.createElement('div')
  dot.style.cssText = [
    'width:8px',
    'height:8px',
    'border-radius:999px',
    'border:1px solid #F7F2E3',
    kind === 'from' ? 'background:#8a8680' : 'background:#2E7D32',
  ].join(';')
  const tag = document.createElement('div')
  tag.textContent = label
  tag.style.cssText = [
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-size:10px',
    'letter-spacing:0.04em',
    'color:#F7F2E3',
    'background:rgba(12,12,14,0.88)',
    'border:1px solid rgba(201,162,39,0.45)',
    'border-radius:3px',
    'padding:1px 4px',
  ].join(';')
  el.appendChild(dot)
  el.appendChild(tag)
  return el
}

function aircraftEl(a: TrackingAircraftPosition): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:3px',
    'pointer-events:none',
  ].join(';')
  const typeHint = a.phase.replace('_', ' ')
  wrap.title = `${a.tail} · ${typeHint}`
  const dot = document.createElement('div')
  dot.style.cssText = [
    'width:14px',
    'height:14px',
    'border-radius:999px',
    'border:2px solid #F7F2E3',
    `background:${PHASE_COLOR[a.phase]}`,
    'box-shadow:0 0 0 2px rgba(201,162,39,0.55)',
  ].join(';')
  const tag = document.createElement('div')
  tag.textContent = a.tail && a.tail !== '—' ? a.tail : 'ACFT'
  tag.style.cssText = [
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-size:10px',
    'font-weight:700',
    'letter-spacing:0.06em',
    'color:#0C0C0E',
    'background:#C9A227',
    'border-radius:3px',
    'padding:1px 5px',
    'white-space:nowrap',
  ].join(';')
  wrap.appendChild(dot)
  wrap.appendChild(tag)
  return wrap
}

function trackKey(a: TrackingAircraftPosition): string {
  return [
    a.tail,
    a.phase,
    a.lat,
    a.lon,
    a.fromLat,
    a.fromLon,
    a.toLat,
    a.toLon,
    a.fromIcao,
    a.toIcao,
    a.source,
  ].join('|')
}

export function PortalAircraftMap({
  aircraft,
  className,
}: {
  aircraft: TrackingAircraftPosition
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const paintedKeyRef = useRef<string>('')

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
      center: [-81.5, 41.1],
      zoom: 5,
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

    const key = trackKey(aircraft)
    if (key === paintedKeyRef.current && markersRef.current.length) return

    const cleanupLayer = () => {
      if (map.getLayer('portal-route')) map.removeLayer('portal-route')
      if (map.getSource('portal-route')) map.removeSource('portal-route')
      if (map.getLayer('portal-track')) map.removeLayer('portal-track')
      if (map.getSource('portal-track')) map.removeSource('portal-track')
    }

    const paint = () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      cleanupLayer()

      const points: [number, number][] = []
      const fromOk =
        aircraft.fromLat != null &&
        aircraft.fromLon != null &&
        !(aircraft.fromLat === 0 && aircraft.fromLon === 0)
      const toOk =
        aircraft.toLat != null &&
        aircraft.toLon != null &&
        !(aircraft.toLat === 0 && aircraft.toLon === 0)
      const acOk =
        aircraft.lat != null &&
        aircraft.lon != null &&
        !(aircraft.lat === 0 && aircraft.lon === 0)

      if (fromOk && toOk) {
        const line: [number, number][] = [
          [aircraft.fromLon!, aircraft.fromLat!],
          [aircraft.toLon!, aircraft.toLat!],
        ]
        map.addSource('portal-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: line },
          },
        })
        map.addLayer({
          id: 'portal-route',
          type: 'line',
          source: 'portal-route',
          paint: {
            'line-color': '#C9A227',
            'line-width': 2.5,
            'line-opacity': 0.75,
            'line-dasharray': [1.5, 1.2],
          },
        })
        points.push(...line)
      }

      // Flown track: origin → current when airborne
      if (fromOk && acOk && aircraft.phase === 'airborne') {
        map.addSource('portal-track', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [aircraft.fromLon!, aircraft.fromLat!],
                [aircraft.lon!, aircraft.lat!],
              ],
            },
          },
        })
        map.addLayer({
          id: 'portal-track',
          type: 'line',
          source: 'portal-track',
          paint: {
            'line-color': '#E3B341',
            'line-width': 3,
            'line-opacity': 0.95,
          },
        })
      }

      if (fromOk) {
        markersRef.current.push(
          new maplibregl.Marker({
            element: airportEl(aircraft.fromIcao || 'ORIG', 'from'),
            anchor: 'bottom',
          })
            .setLngLat([aircraft.fromLon!, aircraft.fromLat!])
            .addTo(map),
        )
        points.push([aircraft.fromLon!, aircraft.fromLat!])
      }
      if (toOk) {
        markersRef.current.push(
          new maplibregl.Marker({
            element: airportEl(aircraft.toIcao || 'DEST', 'to'),
            anchor: 'bottom',
          })
            .setLngLat([aircraft.toLon!, aircraft.toLat!])
            .addTo(map),
        )
        points.push([aircraft.toLon!, aircraft.toLat!])
      }
      if (acOk) {
        markersRef.current.push(
          new maplibregl.Marker({
            element: aircraftEl(aircraft),
            anchor: 'bottom',
          })
            .setLngLat([aircraft.lon!, aircraft.lat!])
            .addTo(map),
        )
        points.push([aircraft.lon!, aircraft.lat!])
      }

      if (points.length === 1) {
        map.easeTo({ center: points[0], zoom: 7, duration: 500 })
      } else if (points.length > 1) {
        const bounds = new maplibregl.LngLatBounds(points[0], points[0])
        for (const p of points) bounds.extend(p)
        map.fitBounds(bounds, {
          padding: { top: 56, bottom: 56, left: 48, right: 48 },
          maxZoom: 9,
          duration: 500,
        })
      }
      paintedKeyRef.current = key
    }

    if (map.loaded()) paint()
    else map.once('load', paint)

    return () => {
      try {
        cleanupLayer()
      } catch {
        /* map may be gone */
      }
    }
  }, [aircraft])

  return (
    <div
      ref={containerRef}
      className={
        className ??
        'h-48 w-full overflow-hidden rounded-md border border-[#ddd6c4] bg-[#141414] sm:h-56'
      }
    />
  )
}
