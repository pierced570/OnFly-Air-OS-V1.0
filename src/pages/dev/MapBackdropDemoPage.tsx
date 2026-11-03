/**
 * Isolated MapBackdrop preview — not part of the client portal.
 * Open `/dev/map-backdrop` to exercise ambient + interactive modes alone.
 */
import { useMemo, useState } from 'react'
import {
  MapBackdrop,
  mapBackdropAirports,
} from '@/components/MapBackdrop'
import { MAP_VIEWBOX } from '@/domain/portalMap'
import '@/styles/ofa-glass.css'

type Framing = keyof typeof MAP_VIEWBOX

const FRAMINGS: { id: Framing; label: string }[] = [
  { id: 'loginWide', label: 'Login wide' },
  { id: 'loginPhone', label: 'Login phone' },
  { id: 'portalDesktop', label: 'Portal desktop' },
]

export default function MapBackdropDemoPage() {
  const [framing, setFraming] = useState<Framing>('loginWide')
  const [mode, setMode] = useState<'ambient' | 'interactive'>('ambient')
  const [dimAmbient, setDimAmbient] = useState(false)
  const [showSelected, setShowSelected] = useState(false)

  const selectedRoute = useMemo(() => {
    if (!showSelected) return undefined
    const from = mapBackdropAirports.find((a) => a.icao === 'KCAK')
    const to = mapBackdropAirports.find((a) => a.icao === 'KMIA')
    if (!from || !to) return undefined
    return {
      from,
      to,
      progress: 0.42,
      telemetry: '412 KTS · FL390 · 0:38 TO GO',
    }
  }, [showSelected])

  return (
    <div
      className="ofa-glass"
      data-theme="client"
      style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--ofa-bg)',
        color: 'var(--ofa-ink)',
      }}
    >
      <MapBackdrop
        mode={mode}
        viewBox={MAP_VIEWBOX[framing]}
        ambientOpacity={dimAmbient ? 0.35 : 1}
        selectedRoute={selectedRoute}
        planeScale={
          framing === 'loginPhone' ? 1 : mode === 'interactive' ? 0.75 : 0.9
        }
      />

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          margin: 20,
          maxWidth: 420,
          padding: 16,
          borderRadius: 16,
          background:
            'linear-gradient(165deg,rgba(44,44,50,.34),rgba(10,10,12,.5))',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          border: '1px solid rgba(255,255,255,.11)',
          boxShadow: '0 20px 50px rgba(0,0,0,.35)',
        }}
      >
        <div className="g-kicker" style={{ marginBottom: 6 }}>
          MapBackdrop demo
        </div>
        <div className="g-title" style={{ marginBottom: 12 }}>
          Doc 02 isolated preview
        </div>
        <p className="g-body" style={{ marginBottom: 14 }}>
          No runtime map libraries. Static SVG + CSS/SMIL. Prefer-reduced-motion
          disables twinkles, trails, and pulses.
        </p>

        <label className="g-label" style={{ display: 'block', marginBottom: 6 }}>
          Framing
        </label>
        <div className="g-seg" style={{ marginBottom: 14 }}>
          {FRAMINGS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={framing === f.id ? 'is-on' : undefined}
              onClick={() => setFraming(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="g-label" style={{ display: 'block', marginBottom: 6 }}>
          Mode
        </label>
        <div className="g-seg" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={mode === 'ambient' ? 'is-on' : undefined}
            onClick={() => setMode('ambient')}
          >
            Ambient
          </button>
          <button
            type="button"
            className={mode === 'interactive' ? 'is-on' : undefined}
            onClick={() => setMode('interactive')}
          >
            Interactive
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className={`g-check${dimAmbient ? ' is-on' : ''}`}
            onClick={() => setDimAmbient((v) => !v)}
          >
            <span className="g-check-box" />
            Dim ambient flights (0.35)
          </button>
          <button
            type="button"
            className={`g-check${showSelected ? ' is-on' : ''}`}
            onClick={() => setShowSelected((v) => !v)}
          >
            <span className="g-check-box" />
            Selected route (KCAK → KMIA)
          </button>
        </div>

        {mode === 'interactive' && (
          <p className="g-body" style={{ marginTop: 14 }}>
            Click two points on the map for a soft-quote arc.
          </p>
        )}
      </div>
    </div>
  )
}
