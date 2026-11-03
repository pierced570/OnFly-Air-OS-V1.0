/**
 * Public ofaops home — glass login over MapBackdrop (doc 03).
 * Auth stays work-email one-tap via PortalOneClickLogin; ops login is /login.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BRAND_EMAIL,
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
} from '@/domain/brand'
import { MapBackdrop } from '@/components/MapBackdrop'
import { PortalInstallBanner } from '@/components/PortalInstallBanner'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import type { PortalSession } from '@/domain/portalAuth'

const EstimateIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="5" cy="18" r="2.5" />
    <circle cx="19" cy="6" r="2.5" />
    <path d="M7 16.5C10 12 14 12 17 7.5" strokeDasharray="2.5 2.5" />
  </svg>
)

const BookIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)

const CallIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
)

function LoginActions() {
  return (
    <div className="ofa-login-rows">
      <Link className="g-row" to="/quote">
        <span className="g-ico">
          <EstimateIcon />
        </span>
        <span className="g-row-txt">
          <span className="g-row-t">Rough estimate</span>
          <span className="g-row-s">One page · ballpark in seconds</span>
        </span>
        <span className="g-dot" aria-hidden="true">
          →
        </span>
      </Link>
      <Link className="g-row" to="/book">
        <span className="g-ico">
          <BookIcon />
        </span>
        <span className="g-row-txt">
          <span className="g-row-t">Book a trip</span>
          <span className="g-row-s">Full form · hard quote in 10–15 min</span>
        </span>
        <span className="g-dot" aria-hidden="true">
          →
        </span>
      </Link>
      <a className="g-row" href={`tel:${BRAND_PHONE_E164}`}>
        <span className="g-ico">
          <CallIcon />
        </span>
        <span className="g-row-txt">
          <span className="g-row-t">Call ops</span>
          <span className="g-row-s">24-hr desk · {BRAND_PHONE}</span>
        </span>
        <span className="g-dot" aria-hidden="true">
          →
        </span>
      </a>
    </div>
  )
}

function LoginShell(props: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={['ofa-glass', props.className].filter(Boolean).join(' ')}
      data-theme="client"
      style={{ position: 'relative', minHeight: '100dvh', background: 'var(--ofa-bg)' }}
    >
      <div className="ofa-login-map" aria-hidden="true">
        <MapBackdrop mode="ambient" planeScale={0.9} />
      </div>
      <div className="ofa-login-scrim" aria-hidden="true" />
      {props.children}
    </div>
  )
}

export function PortalLanding(props?: {
  onSignedIn?: (session: PortalSession) => void
  loginFocus?: boolean
  companyName?: string | null
  companyDomains?: string[] | null
  expectedClientId?: string | null
  nextHref?: string | null
}) {
  const company = (props?.companyName ?? '').trim()
  const domains = (props?.companyDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  const domainHint =
    domains.length > 0
      ? `Use your @${domains[0]} work email`
      : 'Work email on file'

  if (props?.loginFocus) {
    return (
      <LoginShell>
        <main className="ofa-login">
          <header className="ofa-login-top">
            <Link to="/">
              <img src={BRAND_LOGO_PATH} alt="OnFly Air" />
            </Link>
            <div className="ofa-login-top-r">
              <Link to="/login?next=/dispatch" className="g-pill">
                <span>
                  Operations<span className="ofa-hide-phone"> login</span>
                </span>
              </Link>
            </div>
          </header>

          <section className="ofa-login-hero" style={{ textAlign: 'left', marginLeft: 0 }}>
            <div className="ofa-login-kicker">
              <i aria-hidden="true" />
              {company ? 'Company portal' : 'Client portal'}
            </div>
            <h1>{company || 'Client login'}</h1>
            {domains.length > 0 ? (
              <div className="ofa-login-sub">
                Sign in with your @{domains[0]} work email — no password.
              </div>
            ) : null}
          </section>

          <section
            className="ofa-login-card g-panel"
            style={{
              maxWidth: 480,
              marginLeft: 0,
              display: 'block',
              gridTemplateColumns: undefined,
            }}
          >
            <PortalOneClickLogin
              variant="ofa"
              onSignedIn={props.onSignedIn}
              nextHref={props.nextHref ?? undefined}
              expectedClientId={props.expectedClientId}
              title={company ? `Client login · ${company}` : 'Client login'}
              hint={domainHint}
              showLegal
            />
          </section>

          <p className="ofa-login-foot" style={{ textAlign: 'left' }}>
            <Link to="/" style={{ color: 'var(--ofa-mute)' }}>
              ← Back home
            </Link>
          </p>
        </main>
      </LoginShell>
    )
  }

  return (
    <LoginShell>
      <main className="ofa-login">
        <PortalInstallBanner density="a2hs" variant="glass" />

        <header className="ofa-login-top">
          <Link to="/">
            <img src={BRAND_LOGO_PATH} alt="OnFly Air" />
          </Link>
          <div className="ofa-login-top-r">
            <a className="ofa-login-ops" href={`tel:${BRAND_PHONE_E164}`}>
              <span className="ofa-login-live" aria-hidden="true" />
              24-hr ops{' '}
              <span className="num">{BRAND_PHONE}</span>
            </a>
            <Link to="/login?next=/dispatch" className="g-pill">
              <span>
                Operations<span className="ofa-hide-phone"> login</span>
              </span>
            </Link>
          </div>
        </header>

        <section className="ofa-login-hero">
          <div className="ofa-login-kicker">
            <i aria-hidden="true" />
            {company ? 'Company portal' : 'Client portal'}
          </div>
          <h1>
            {company ? (
              company
            ) : (
              <>
                Your freight, in the air
                <br />
                and on the screen.
              </>
            )}
          </h1>
          <div className="ofa-login-sub">
            {company
              ? `${domainHint} — live tracking, past trips, rebooking and soft quotes.`
              : 'Live tracking, past trips, rebooking and soft quotes — one sign-in.'}
          </div>
        </section>

        <section className="ofa-login-card g-panel">
          <PortalOneClickLogin
            variant="ofa"
            onSignedIn={props?.onSignedIn}
            nextHref={props?.nextHref ?? undefined}
            expectedClientId={props?.expectedClientId}
            title={company ? `Client login · ${company}` : 'Client login'}
            hint={domainHint}
            showLegal
          />

          <div className="ofa-login-col">
            <div className="ofa-login-col-h">
              <h3>No account needed</h3>
              <span>24/7/365</span>
            </div>
            <LoginActions />
          </div>
        </section>

        <footer className="ofa-login-foot">
          <a href="https://onflyair.com">onflyair.com</a>
          {' · '}
          <a href={`tel:${BRAND_PHONE_E164}`}>{BRAND_PHONE}</a>
          <span className="email">
            {' · '}
            <a href={`mailto:${BRAND_EMAIL}`}>{BRAND_EMAIL}</a>
          </span>
        </footer>
      </main>
    </LoginShell>
  )
}
