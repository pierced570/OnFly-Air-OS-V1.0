import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FleetStatus } from '@/domain/fleetStatus'

const COLOR: Record<string, string> = {
  airborne: '#C9A227',
  on_ground: '#2E7D32',
  no_data: '#8a8680',
}

function labelFor(s: FleetStatus): string {
  const type = (s.type_name ?? '').trim() || '—'
  const op = (s.operator_name ?? '').trim()
  const phase = s.laddBlocked ? 'no ADS-B' : s.phase.replace('_', ' ')
  return op ? `${s.tail} · ${type} · ${op} · ${phase}` : `${s.tail} · ${type} · ${phase}`
}

function popupHtml(s: FleetStatus): string {
  const type = escapeHtml((s.type_name ?? '').trim() || '—')
  const op = escapeHtml((s.operator_name ?? '').trim() || '—')
  const phase = escapeHtml(
    s.laddBlocked ? 'no ADS-B' : s.phase.replace('_', ' '),
  )
  const tail = escapeHtml(s.tail)
  return `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-width: 9rem;">
      <div style="color:#C9A227;font-size:13px;font-weight:600;letter-spacing:0.04em;">${tail}</div>
      <div style="color:#F7F2E3;font-size:12px;margin-top:2px;">${type}</div>
      <div style="color:#8a8680;font-size:11px;margin-top:2px;">${op}</div>
      <div style="color:#8a8680;font-size:10px;margin-top:4px;text-transform:uppercase;letter-spacing:0.06em;">${phase}</div>
    </div>
  `
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  const popupRef = useRef<maplibregl.Popup | null>(null)

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
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    )
    mapRef.current = map
    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 12,
      className: 'radar-map-popup',
      maxWidth: '240px',
    })

    return () => {
      popupRef.current?.remove()
      popupRef.current = null
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
      popupRef.current?.remove()
      for (const s of statuses) {
        if (s.lat === 0 && s.lon === 0) continue
        const el = document.createElement('button')
        el.type = 'button'
        el.title = labelFor(s)
        el.setAttribute('aria-label', labelFor(s))
        el.style.width = '10px'
        el.style.height = '10px'
        el.style.borderRadius = '999px'
        el.style.border = s.laddBlocked
          ? '2px solid #C0392B'
          : '1px solid #0C0C0E'
        el.style.background = COLOR[s.phase] ?? '#C9A227'
        el.style.boxShadow = '0 0 0 1px rgba(201,162,39,0.35)'
        el.style.cursor = 'pointer'
        el.onclick = (ev) => {
          ev.stopPropagation()
          onSelect?.(s.tail)
          popupRef.current
            ?.setLngLat([s.lon, s.lat])
            .setHTML(popupHtml(s))
            .addTo(map)
        }
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([s.lon, s.lat])
          .addTo(map)
        markers.push(marker)
      }
    }

    if (map.loaded()) paint()
    else map.once('load', paint)
    return () => {
      for (const m of markers) m.remove()
    }
  }, [statuses, onSelect])

  return (
    <>
      <style>{`
        .radar-map-popup .maplibregl-popup-content {
          background: #141414;
          color: #F7F2E3;
          border: 1px solid #2a2a2e;
          border-radius: 6px;
          padding: 8px 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.45);
        }
        .radar-map-popup .maplibregl-popup-tip {
          border-top-color: #141414;
          border-bottom-color: #141414;
        }
        .radar-map-popup .maplibregl-popup-close-button {
          color: #8a8680;
          font-size: 16px;
          padding: 0 6px;
        }
        .radar-map-popup .maplibregl-popup-close-button:hover {
          color: #C9A227;
          background: transparent;
        }
      `}</style>
      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-lg border border-border bg-surface sm:h-96"
      />
    </>
  )
}
