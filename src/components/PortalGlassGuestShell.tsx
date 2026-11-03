/**
 * Guest estimate / book chrome — same dark glass + MapBackdrop as login,
 * so /quote and /book don't drop into the old cream portal shell.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MapBackdrop } from '@/components/MapBackdrop'
import {
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
} from '@/domain/brand'

export function PortalGlassGuestShell(props: {
  children: ReactNode
  /** Short kicker above the panel title area (optional). */
  kicker?: string
  title?: string
  subtitle?: string
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="ofa-glass ofa-login" style={{ minHeight: '100dvh' }}>
      <div className="ofa-login-map" aria-hidden="true">
        <MapBackdrop mode="ambient" planeScale={0.9} />
      </div>
      <div className="ofa-login-scrim" aria-hidden="true" />

      <header className="ofa-login-top">
        <Link to="/">
          <img src={BRAND_LOGO_PATH} alt="OnFly Air" />
        </Link>
        <div className="ofa-login-top-r">
          <a className="ofa-login-ops" href={`tel:${BRAND_PHONE_E164}`}>
            <span className="ofa-login-live" aria-hidden="true" />
            <span className="num">{BRAND_PHONE}</span>
          </a>
          <Link to="/login?next=/dispatch" className="g-ghost">
            Operations
          </Link>
        </div>
      </header>

      <main
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: 720,
          margin: '28px auto 0',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 32,
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <Link
            to={props.backHref ?? '/'}
            style={{
              font: '500 13px/1 var(--ofa-font)',
              color: 'var(--ofa-gold-2)',
              textDecoration: 'none',
            }}
          >
            ← {props.backLabel ?? 'Portal'}
          </Link>
        </div>

        {(props.kicker || props.title || props.subtitle) && (
          <div style={{ marginBottom: 16 }}>
            {props.kicker ? (
              <div className="ofa-login-kicker">
                <i aria-hidden="true" />
                {props.kicker}
              </div>
            ) : null}
            {props.title ? (
              <h1
                style={{
                  font: '500 28px/1.15 var(--ofa-font)',
                  letterSpacing: '-.02em',
                  color: 'var(--ofa-ink)',
                  margin: '10px 0 0',
                }}
              >
                {props.title}
              </h1>
            ) : null}
            {props.subtitle ? (
              <p
                style={{
                  font: '400 14px/1.45 var(--ofa-font)',
                  color: 'var(--ofa-mute)',
                  margin: '8px 0 0',
                }}
              >
                {props.subtitle}
              </p>
            ) : null}
          </div>
        )}

        <section className="g-panel" style={{ padding: '22px 20px 20px' }}>
          {props.children}
        </section>
      </main>
    </div>
  )
}
