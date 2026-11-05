/**
 * Guest hard-quote chrome — map backdrop, left form, right "What dispatch sees".
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MapBackdrop } from '@/components/MapBackdrop'
import {
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
} from '@/domain/brand'
import {
  portalGuestHardQuoteSoftBand,
  type PortalDispatchSeesView,
} from '@/domain/portalGuestHardQuote'
import { softQuotePointLabel } from '@/domain/portalSoftQuote'
import { projectLonLat, type MapProjection } from '@/domain/portalMap'
import portalMapData from '@/data/portalMapData.json'

const projection = portalMapData.us_map.projection as MapProjection

function toMapPoint(p: { lat: number; lon: number; code?: string | null }) {
  const pt = projectLonLat(p.lon, p.lat, projection)
  const code = p.code?.trim().toUpperCase()
  return {
    x: pt.x,
    y: pt.y,
    lat: p.lat,
    lon: p.lon,
    icao: code || undefined,
    label: code || softQuotePointLabel(p),
  }
}

export function PortalGuestHardQuoteLayout(props: {
  signedIn: boolean
  loginHref: string
  dispatch: PortalDispatchSeesView
  notes: string
  onNotes: (v: string) => void
  busy?: boolean
  onRequestNow: () => void
  children: ReactNode
}) {
  const band = portalGuestHardQuoteSoftBand(props.dispatch.soft)
  const quotePoints =
    props.dispatch.from && props.dispatch.to
      ? {
          a: toMapPoint(props.dispatch.from),
          b: toMapPoint(props.dispatch.to),
          nm: props.dispatch.softNm ?? undefined,
        }
      : undefined

  return (
    <div className="ofa-glass ofa-guest-hq" style={{ minHeight: '100dvh' }}>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
        }}
        aria-hidden="true"
      >
        <MapBackdrop
          mode="interactive"
          viewBox="0 0 1440 900"
          quotePoints={quotePoints}
          showQuoteHint={false}
          planeScale={0.85}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 30% 40%, rgba(8,8,10,.15), rgba(8,8,10,.72) 55%, rgba(8,8,10,.88))',
            pointerEvents: 'none',
          }}
        />
      </div>

      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/">
            <img src={BRAND_LOGO_PATH} alt="OnFly Air" style={{ height: 20 }} />
          </Link>
          <Link
            to="/"
            style={{
              font: '500 13px/1 var(--ofa-font)',
              color: 'var(--ofa-gold-2)',
              textDecoration: 'none',
            }}
          >
            ← Home
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              font: '500 12.5px/1 var(--ofa-font)',
              color: 'var(--ofa-ink)',
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--ofa-green, #3F7D51)',
                boxShadow: '0 0 8px rgba(63,125,81,.6)',
              }}
            />
            Dispatch online ·{' '}
            <span className="g-mono" style={{ color: 'var(--ofa-gold-2)' }}>
              {BRAND_PHONE}
            </span>
          </a>
          {!props.signedIn ? (
            <>
              <span style={{ font: '400 12.5px/1 var(--ofa-font)', color: 'var(--ofa-mute)' }}>
                Already moving?
              </span>
              <Link to={props.loginHref} className="g-ghost" style={{ height: 36, padding: '0 14px' }}>
                Sign in
              </Link>
            </>
          ) : (
            <Link to="/" className="g-ghost" style={{ height: 36, padding: '0 14px' }}>
              My trips
            </Link>
          )}
        </div>
      </header>

      <main
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 440px) minmax(300px, 380px)',
          justifyContent: 'space-between',
          gap: 24,
          padding: '8px 20px 28px',
          alignItems: 'start',
        }}
      >
        <section
          className="g-panel g-panel--dense"
          style={{
            maxHeight: 'calc(100dvh - 88px)',
            overflow: 'auto',
            padding: '16px 16px 20px',
          }}
        >
          <div className="g-kicker">Hard quote</div>
          <h1
            style={{
              margin: '8px 0 0',
              font: '500 24px/1.15 var(--ofa-font)',
              letterSpacing: '-.025em',
              color: 'var(--ofa-ink)',
            }}
          >
            Let&apos;s get your freight moving
          </h1>
          <p className="g-body" style={{ marginTop: 8, fontSize: 13.5 }}>
            One page. Our team quotes in 10–15 minutes — no login required.
          </p>
          <div style={{ marginTop: 16 }}>{props.children}</div>
        </section>

        <aside
          className="g-panel g-panel--dense"
          style={{
            position: 'sticky',
            top: 16,
            padding: '16px',
            maxHeight: 'calc(100dvh - 88px)',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div className="g-kicker">What dispatch sees</div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                font: '500 11.5px/1 var(--ofa-font)',
                color: props.dispatch.ready
                  ? 'var(--ofa-green, #3F7D51)'
                  : 'var(--ofa-mute)',
              }}
            >
              <i
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: props.dispatch.ready
                    ? 'var(--ofa-green, #3F7D51)'
                    : '#6F6F74',
                }}
              />
              {props.dispatch.ready ? 'Ready to send' : 'Needs info'}
            </span>
          </div>

          <dl style={{ margin: '14px 0 0', display: 'grid', gap: 10 }}>
            {props.dispatch.rows.map((row) => (
              <div key={row.label}>
                <dt
                  style={{
                    font: '500 10.5px/1 var(--ofa-font)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: '#6F6F74',
                  }}
                >
                  {row.label}
                </dt>
                <dd
                  style={{
                    margin: '4px 0 0',
                    font: '400 13px/1.35 var(--ofa-font)',
                    color: 'var(--ofa-ink)',
                  }}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          {band ? (
            <div
              style={{
                marginTop: 16,
                padding: '14px 14px 12px',
                borderRadius: 14,
                border: '1px solid rgba(201,162,39,.45)',
                background:
                  'linear-gradient(165deg, rgba(44,44,50,.9), rgba(12,12,14,.92))',
              }}
            >
              <div className="g-kicker" style={{ fontSize: 11 }}>
                Rough estimate
              </div>
              <div
                className="g-mono"
                style={{
                  marginTop: 8,
                  fontSize: 26,
                  fontWeight: 500,
                  letterSpacing: '-.02em',
                  color: 'var(--ofa-gold-2)',
                }}
              >
                {band.price}
              </div>
              <div
                style={{
                  marginTop: 4,
                  font: '400 12px/1.3 var(--ofa-font)',
                  color: 'var(--ofa-mute)',
                }}
              >
                {band.blurb}
              </div>
            </div>
          ) : (
            <p className="g-body" style={{ marginTop: 14 }}>
              Pick origin and destination airports to unlock a rough band.
            </p>
          )}

          <label style={{ display: 'block', marginTop: 14 }}>
            <span className="g-label">Notes</span>
            <textarea
              value={props.notes}
              onChange={(e) => props.onNotes(e.target.value)}
              rows={3}
              placeholder="Special handling, access, contacts on site…"
              className="g-field"
              style={{
                marginTop: 6,
                width: '100%',
                minHeight: 72,
                resize: 'vertical',
                padding: 12,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.04)',
                color: 'var(--ofa-ink)',
                font: '400 13px/1.4 var(--ofa-font)',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <button
            type="button"
            className="g-btn"
            style={{ width: '100%', marginTop: 14 }}
            disabled={props.busy || !props.dispatch.ready}
            onClick={props.onRequestNow}
          >
            {props.busy ? 'Submitting…' : 'Request this flight / delivery NOW'}
          </button>
          <p
            className="g-body"
            style={{
              marginTop: 10,
              textAlign: 'center',
              fontSize: 11.5,
              lineHeight: 1.4,
            }}
          >
            Our phones ring the moment you send. Hard quote in 10–15 min.
          </p>
        </aside>
      </main>

      <style>{`
        @media (max-width: 960px) {
          .ofa-guest-hq main {
            grid-template-columns: 1fr !important;
          }
          .ofa-guest-hq aside {
            position: relative !important;
            top: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
