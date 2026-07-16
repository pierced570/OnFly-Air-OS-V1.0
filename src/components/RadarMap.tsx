import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FleetStatus } from '@/domain/fleetStatus'

const COLOR: Record<string, string> = {
  likely_rested: '#2E7D32',
  rest_clock_running: '#C9A227',
  unknown: '#8a8680',
}

export function RadarMap({
  statuses,
  onSelect,
}: {
  statuses: FleetStatus[]
  onSelect?: (tail: string) => void
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
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [-81.5, 41.1],
      zoom: 5.5,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
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
    const paint = () => {
      for (const m of markers) m.remove()
      markers.length = 0
      for (const s of statuses) {
        if (s.lat === 0 && s.lon === 0) continue
        const el = document.createElement('button')
        el.type = 'button'
        el.title = `${s.tail} · ${s.rest}${s.laddBlocked ? ' · LADD' : ''}`
        el.style.width = '10px'
        el.style.height = '10px'
        el.style.borderRadius = '999px'
        el.style.border = s.laddBlocked ? '2px solid #C0392B' : '1px solid #0C0C0E'
        el.style.background = COLOR[s.rest] ?? '#C9A227'
        el.style.boxShadow = '0 0 0 1px rgba(201,162,39,0.35)'
        el.style.cursor = 'pointer'
        el.onclick = () => onSelect?.(s.tail)
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([s.lon, s.lat])
          .addTo(map)
        markers.push(marker)
      }
      if (statuses.length) {
        const bounds = new maplibregl.LngLatBounds()
        for (const s of statuses) bounds.extend([s.lon, s.lat])
        map.fitBounds(bounds, { padding: 48, maxZoom: 7 })
      }
    }

    if (map.isStyleLoaded()) paint()
    else map.once('load', paint)

    return () => {
      for (const m of markers) m.remove()
    }
  }, [statuses, onSelect])

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full overflow-hidden rounded-lg border border-border"
    />
  )
}
