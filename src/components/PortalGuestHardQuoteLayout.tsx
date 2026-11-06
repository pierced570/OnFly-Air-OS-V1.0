/**
 * Guest hard-quote chrome — map backdrop.
 * Desktop: left form + right "What dispatch sees".
 * Mobile (sheet): bottom glass sheet over the map (3-step wizard lives in children).
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

function PhoneFab() {
  return (
    <a
      href={`tel:${BRAND_PHONE_E164}`}
      aria-label={`Call dispatch ${BRAND_PHONE}`}
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, var(--ofa-gold-2), #A8841C)',
        color: '#0C0C0E',
        boxShadow: '0 8px 20px rgba(201,162,39,.35)',
        textDecoration: 'none',
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
      </svg>
    </a>
  )
}

export function PortalGuestHardQuoteLayout(props: {
  signedIn: boolean
  loginHref: string
  /** Mobile bottom-sheet layout (wizard form); hide desktop dispatch rail. */
  sheet?: boolean
  /** Wizard step 1–3 for mobile progress chrome. */
  wizardStep?: 1 | 2 | 3
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
  const step = props.wizardStep ?? 1
  const sheet = Boolean(props.sheet)

  return (
    <div
      className={[
        'ofa-glass ofa-guest-hq',
        sheet ? 'ofa-guest-hq--sheet' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ minHeight: '100dvh' }}
    >
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
          planeScale={sheet ? 0.95 : 0.85}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: sheet
              ? 'linear-gradient(180deg, rgba(8,8,10,.25) 0%, rgba(8,8,10,.55) 42%, rgba(8,8,10,.82) 100%)'
              : 'radial-gradient(ellipse at 30% 40%, rgba(8,8,10,.15), rgba(8,8,10,.72) 55%, rgba(8,8,10,.88))',
            pointerEvents: 'none',
          }}
        />
      </div>

      <header className="ofa-guest-hq__top">
        <Link to="/">
          <img src={BRAND_LOGO_PATH} alt="OnFly Air" style={{ height: 20 }} />
        </Link>
        <div className="ofa-guest-hq__top-r">
          {!sheet ? (
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="ofa-guest-hq__dispatch"
            >
              <span className="ofa-guest-hq__live" />
              Dispatch online ·{' '}
              <span className="g-mono" style={{ color: 'var(--ofa-gold-2)' }}>
                {BRAND_PHONE}
              </span>
            </a>
          ) : null}
          {!props.signedIn ? (
            <>
              {!sheet ? (
                <span className="ofa-guest-hq__already">Already moving?</span>
              ) : null}
              <Link
                to={props.loginHref}
                className="g-ghost"
                style={{ height: 36, padding: '0 14px' }}
              >
                Sign in
              </Link>
            </>
          ) : (
            <Link
              to="/"
              className="g-ghost"
              style={{ height: 36, padding: '0 14px' }}
            >
              My trips
            </Link>
          )}
          {sheet ? <PhoneFab /> : null}
        </div>
      </header>

      <main className="ofa-guest-hq__main">
        <section className="g-panel g-panel--dense ofa-guest-hq__form">
          {sheet ? <div className="ofa-guest-hq__handle" aria-hidden="true" /> : null}
          {!sheet ? <div className="g-kicker">Hard quote</div> : null}
          {!sheet || step === 1 ? (
            <>
              <h1 className="ofa-guest-hq__title">
                Let&apos;s get your freight moving
              </h1>
              <p className="g-body ofa-guest-hq__sub">
                {sheet
                  ? 'Quote in 10–15 min · no login'
                  : 'One page. Our team quotes in 10–15 minutes — no login required.'}
              </p>
            </>
          ) : null}
          {sheet ? (
            <div className="ofa-guest-hq__progress" aria-label={`Step ${step} of 3`}>
              {[1, 2, 3].map((n) => (
                <i
                  key={n}
                  className={n <= step ? 'is-on' : undefined}
                  aria-hidden="true"
                />
              ))}
              <span className="ofa-guest-hq__step-label">Step {step} of 3</span>
            </div>
          ) : null}
          <div className="ofa-guest-hq__form-body">{props.children}</div>
        </section>

        {!sheet ? (
          <aside className="g-panel g-panel--dense ofa-guest-hq__rail">
            <div className="ofa-guest-hq__rail-head">
              <div className="g-kicker">What dispatch sees</div>
              <span
                className="ofa-guest-hq__ready"
                style={{
                  color: props.dispatch.ready
                    ? 'var(--ofa-green, #3F7D51)'
                    : 'var(--ofa-mute)',
                }}
              >
                <i
                  style={{
                    background: props.dispatch.ready
                      ? 'var(--ofa-green, #3F7D51)'
                      : '#6F6F74',
                  }}
                />
                {props.dispatch.ready ? 'Ready to send' : 'Needs info'}
              </span>
            </div>

            <dl className="ofa-guest-hq__rows">
              {props.dispatch.rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>

            {band ? (
              <div className="ofa-guest-hq__band">
                <div className="g-kicker" style={{ fontSize: 11 }}>
                  Rough estimate
                </div>
                <div className="g-mono ofa-guest-hq__band-price">{band.price}</div>
                <div className="ofa-guest-hq__band-blurb">{band.blurb}</div>
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
            <p className="g-body ofa-guest-hq__cta-hint">
              Our phones ring the moment you send. Hard quote in 10–15 min.
            </p>
          </aside>
        ) : null}
      </main>

      <style>{`
        .ofa-guest-hq__top {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 20px;
        }
        .ofa-guest-hq__top-r {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ofa-guest-hq__dispatch {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font: 500 12.5px/1 var(--ofa-font);
          color: var(--ofa-ink);
          text-decoration: none;
        }
        .ofa-guest-hq__live {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--ofa-green, #3F7D51);
          box-shadow: 0 0 8px rgba(63,125,81,.6);
        }
        .ofa-guest-hq__already {
          font: 400 12.5px/1 var(--ofa-font);
          color: var(--ofa-mute);
        }
        .ofa-guest-hq__main {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: minmax(320px, 440px) minmax(300px, 380px);
          justify-content: space-between;
          gap: 24px;
          padding: 8px 20px 28px;
          align-items: start;
        }
        .ofa-guest-hq__form {
          max-height: calc(100dvh - 88px);
          overflow: auto;
          padding: 16px 16px 20px;
        }
        .ofa-guest-hq__title {
          margin: 8px 0 0;
          font: 500 24px/1.15 var(--ofa-font);
          letter-spacing: -.025em;
          color: var(--ofa-ink);
        }
        .ofa-guest-hq__sub {
          margin-top: 8px;
          font-size: 13.5px;
        }
        .ofa-guest-hq__form-body {
          margin-top: 16px;
        }
        .ofa-guest-hq__rail {
          position: sticky;
          top: 16px;
          padding: 16px;
          max-height: calc(100dvh - 88px);
          overflow: auto;
        }
        .ofa-guest-hq__rail-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ofa-guest-hq__ready {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: 500 11.5px/1 var(--ofa-font);
        }
        .ofa-guest-hq__ready i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: block;
        }
        .ofa-guest-hq__rows {
          margin: 14px 0 0;
          display: grid;
          gap: 10px;
        }
        .ofa-guest-hq__rows dt {
          font: 500 10.5px/1 var(--ofa-font);
          letter-spacing: .06em;
          text-transform: uppercase;
          color: #6F6F74;
        }
        .ofa-guest-hq__rows dd {
          margin: 4px 0 0;
          font: 400 13px/1.35 var(--ofa-font);
          color: var(--ofa-ink);
        }
        .ofa-guest-hq__band {
          margin-top: 16px;
          padding: 14px 14px 12px;
          border-radius: 14px;
          border: 1px solid rgba(201,162,39,.45);
          background: linear-gradient(165deg, rgba(44,44,50,.9), rgba(12,12,14,.92));
        }
        .ofa-guest-hq__band-price {
          margin-top: 8px;
          font-size: 26px;
          font-weight: 500;
          letter-spacing: -.02em;
          color: var(--ofa-gold-2);
        }
        .ofa-guest-hq__band-blurb {
          margin-top: 4px;
          font: 400 12px/1.3 var(--ofa-font);
          color: var(--ofa-mute);
        }
        .ofa-guest-hq__cta-hint {
          margin-top: 10px;
          text-align: center;
          font-size: 11.5px;
          line-height: 1.4;
        }
        .ofa-guest-hq__handle {
          width: 36px;
          height: 4px;
          border-radius: 999px;
          background: rgba(255,255,255,.18);
          margin: 0 auto 14px;
        }
        .ofa-guest-hq__progress {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          align-items: center;
          gap: 6px;
          margin-top: 14px;
        }
        .ofa-guest-hq__progress i {
          height: 3px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
          display: block;
        }
        .ofa-guest-hq__progress i.is-on {
          background: var(--ofa-gold-2);
        }
        .ofa-guest-hq__step-label {
          font: 500 11px/1 var(--ofa-font);
          color: var(--ofa-mute);
          margin-left: 6px;
          white-space: nowrap;
        }

        .ofa-guest-hq--sheet .ofa-guest-hq__main {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          min-height: calc(100dvh - 64px);
          padding: 0 12px 12px;
          grid-template-columns: none;
        }
        .ofa-guest-hq--sheet .ofa-guest-hq__form {
          max-height: min(72dvh, 640px);
          border-radius: 22px 22px 18px 18px;
          padding: 10px 14px 18px;
        }
        .ofa-guest-hq--sheet .ofa-guest-hq__title {
          margin-top: 0;
          font-size: 22px;
        }
        .ofa-guest-hq--sheet .ofa-guest-hq__form-body {
          margin-top: 12px;
        }

        @media (max-width: 960px) {
          .ofa-guest-hq:not(.ofa-guest-hq--sheet) .ofa-guest-hq__main {
            grid-template-columns: 1fr;
          }
          .ofa-guest-hq:not(.ofa-guest-hq--sheet) .ofa-guest-hq__rail {
            position: relative;
            top: 0;
          }
          .ofa-guest-hq__already,
          .ofa-guest-hq__dispatch {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
