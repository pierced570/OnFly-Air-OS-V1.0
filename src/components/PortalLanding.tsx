/**
 * Public ofaops home — compact logo + Staff top-right, then stacked actions.
 * Client login left / Estimate·Book·Call stacked right (single column on mobile).
 */

import { Link } from 'react-router-dom'
import {
  BRAND_LOGO_LIGHT_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
} from '@/domain/brand'
import { PortalAtmosphere } from '@/components/PortalGlass'
import { PortalInstallBanner } from '@/components/PortalInstallBanner'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import { PortalQuickActions } from '@/components/PortalQuickActions'
import type { PortalSession } from '@/domain/portalAuth'

export function PortalLanding(props?: {
  onSignedIn?: (session: PortalSession) => void
  loginFocus?: boolean
  companyName?: string | null
  companyDomains?: string[] | null
  expectedClientId?: string | null
  nextHref?: string | null
  continueTrackHref?: string | null
}) {
  const company = (props?.companyName ?? '').trim()
  const domains = (props?.companyDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  const domainHint =
    domains.length > 0
      ? `Use your @${domains[0]} work email — opens ${company || 'this company'} instantly. No password.`
      : 'Work email on file at the desk — opens your company portal. No password.'

  if (props?.loginFocus) {
    return (
      <PortalAtmosphere className="portal-atmosphere--landing" detail>
        <header className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
          <Link to="/">
            <img
              src={BRAND_LOGO_LIGHT_PATH}
              alt="OnFly Air"
              className="h-8 w-auto max-w-[160px] object-contain object-left"
            />
          </Link>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="avionic text-sm font-semibold text-ink"
          >
            {BRAND_PHONE}
          </a>
        </header>
        <main className="mx-auto max-w-lg space-y-5 px-4 pb-16 sm:px-8">
          {company ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                Company portal
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {company}
              </h1>
            </div>
          ) : null}
          <PortalOneClickLogin
            variant="glass"
            onSignedIn={props.onSignedIn}
            nextHref={props.nextHref ?? undefined}
            expectedClientId={props.expectedClientId}
            title={company ? `Client login · ${company}` : 'Client login'}
            hint={
              company
                ? domainHint
                : 'Enter your work email — we open the right company portal.'
            }
          />
          <PortalQuickActions stacked compact />
          <p className="text-center text-sm">
            <Link to="/" className="font-semibold text-ink hover:text-gold">
              ← Back home
            </Link>
          </p>
        </main>
      </PortalAtmosphere>
    )
  }

  return (
    <PortalAtmosphere className="portal-atmosphere--landing">
      <div className="pt-[max(0px,env(safe-area-inset-top))]">
        <PortalInstallBanner variant="glass" density="banner" />
      </div>

      {/* Compact logo left · Staff login top right */}
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link to="/" className="min-w-0 shrink">
          <img
            src={BRAND_LOGO_LIGHT_PATH}
            alt="OnFly Air"
            className="h-8 w-auto max-w-[150px] object-contain object-left sm:h-9 sm:max-w-[170px]"
          />
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="hidden avionic text-xs font-semibold text-ink hover:text-gold sm:inline"
          >
            {BRAND_PHONE}
          </a>
          <Link
            to="/login?next=/dispatch"
            className="inline-flex min-h-10 items-center rounded-full border border-ink/15 bg-ink/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream backdrop-blur hover:border-gold/40"
          >
            Staff login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-2 sm:px-8 sm:pt-4">
        <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
          {/* Left — headline + client login (replaces hero image) */}
          <section className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                {company ? 'Company portal' : 'Client portal'}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {company
                  ? company
                  : 'Your freight, in the air and on the screen.'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {company
                  ? 'Sign in for live trips — or estimate, book, or call without an account.'
                  : 'Sign in for live shipments — or start without an account.'}
              </p>
            </div>

            {props?.continueTrackHref ? (
              <Link
                to={props.continueTrackHref}
                className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-ink/15 bg-[#FFFDFA] px-4 py-3 text-ink transition hover:border-ink/35"
              >
                <div>
                  <div className="text-sm font-semibold">
                    Continue tracking
                  </div>
                  <p className="text-xs text-muted">
                    Last tracking link — no account needed.
                  </p>
                </div>
                <span className="text-ink" aria-hidden>
                  →
                </span>
              </Link>
            ) : null}

            <PortalOneClickLogin
              variant="glass"
              onSignedIn={props?.onSignedIn}
              nextHref={props?.nextHref ?? undefined}
              expectedClientId={props?.expectedClientId}
              title={company ? `Client login · ${company}` : 'Client login'}
              hint={
                company
                  ? domainHint
                  : 'Work email on file — live tracking, past trips, booking. No password.'
              }
            />
          </section>

          {/* Right — three stacked buttons */}
          <section className="space-y-3 lg:pt-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              No account needed
            </h2>
            <PortalQuickActions stacked />
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-6 text-xs text-muted">
          <a href="https://onflyair.com" className="hover:text-ink">
            onflyair.com
          </a>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="avionic hover:text-ink sm:hidden"
          >
            {BRAND_PHONE}
          </a>
        </footer>
      </main>
    </PortalAtmosphere>
  )
}
