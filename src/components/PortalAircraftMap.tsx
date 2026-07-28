/**
 * Client-portal aircraft map — cream theme, ICAO + position only (no operator).
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
    'border:1px solid #0C0C0E',
    kind === 'from' ? 'background:#8a8680' : 'background:#2E7D32',
  ].join(';')
  const tag = document.createElement('div')
  tag.textContent = label
  tag.style.cssText = [
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-size:10px',
    'letter-spacing:0.04em',
    'color:#0C0C0E',
    'background:rgba(247,242,227,0.92)',
    'border:1px solid #ddd6c4',
    'border-radius:3px',
    'padding:1px 4px',
  ].join(';')
  el.appendChild(dot)
  el.appendChild(tag)
  return el
}

function aircraftEl(a: TrackingAircraftPosition): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  const typeHint = a.phase.replace('_', ' ')
  el.title = `${a.tail} · ${typeHint}`
  el.style.cssText = [
    'width:14px',
    'height:14px',
    'border-radius:999px',
    'border:2px solid #0C0C0E',
    `background:${PHASE_COLOR[a.phase]}`,
    'box-shadow:0 0 0 2px rgba(201,162,39,0.45)',
    'cursor:default',
    'padding:0',
  ].join(';')
  return el
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
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
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers: maplibregl.Marker[] = []
    const cleanupLayer = () => {
      if (map.getLayer('portal-route')) map.removeLayer('portal-route')
      if (map.getSource('portal-route')) map.removeSource('portal-route')
    }

    const paint = () => {
      for (const m of markers) m.remove()
      markers.length = 0
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
            'line-opacity': 0.85,
          },
        })
        points.push(...line)
      }

      if (fromOk) {
        markers.push(
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
        markers.push(
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
        markers.push(
          new maplibregl.Marker({ element: aircraftEl(aircraft) })
            .setLngLat([aircraft.lon!, aircraft.lat!])
            .addTo(map),
        )
        points.push([aircraft.lon!, aircraft.lat!])
      }

      if (points.length === 1) {
        map.easeTo({ center: points[0], zoom: 7, duration: 400 })
      } else if (points.length > 1) {
        const bounds = new maplibregl.LngLatBounds(points[0], points[0])
        for (const p of points) bounds.extend(p)
        map.fitBounds(bounds, { padding: 48, maxZoom: 8, duration: 400 })
      }
    }

    if (map.loaded()) paint()
    else map.once('load', paint)

    return () => {
      for (const m of markers) m.remove()
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
        'h-48 w-full overflow-hidden rounded-md border border-[#ddd6c4] bg-[#F7F2E3] sm:h-56'
      }
    />
  )
}
