/**
 * Public ofaops home — glass client gate.
 * Client login (work email) + rough estimate / book / call.
 * Quiet Staff login → scratchpad → desk app.
 */

import { Link } from 'react-router-dom'
import {
  BRAND_FALCON_CARGO_DETAIL_PATH,
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
} from '@/domain/brand'
import { PortalAtmosphere, PortalGlassPanel } from '@/components/PortalGlass'
import { PortalInstallBanner } from '@/components/PortalInstallBanner'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import type { PortalSession } from '@/domain/portalAuth'

export function PortalLanding(props?: {
  onSignedIn?: (session: PortalSession) => void
  /** Login-only page (quiet secondary). Default = full two-column gate. */
  loginFocus?: boolean
  /** Company portal — show company name + lock login to that client. */
  companyName?: string | null
  companyDomains?: string[] | null
  expectedClientId?: string | null
  /** After sign-in (from ?next=). */
  nextHref?: string | null
  /**
   * Optional magic-link resume — keep the landing as home; don't dump
   * guests into a cream "inside portal" screen.
   */
  continueTrackHref?: string | null
}) {
  const company = (props?.companyName ?? '').trim()
  const domains = (props?.companyDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  const domainHint =
    domains.length > 0
      ? `Use your @${domains[0]} work email — opens ${company || 'this company'} instantly. No password.`
      : 'Just your work email on file at the desk — opens your company portal. No password.'

  if (props?.loginFocus) {
    return (
      <PortalAtmosphere className="portal-atmosphere--landing" detail>
        <header className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
          <Link to="/" className="portal-glass-ink rounded-2xl px-3 py-2">
            <img
              src={BRAND_LOGO_PATH}
              alt="OnFly Air"
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          </Link>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="portal-glass rounded-full px-3 py-2 text-[11px] font-semibold text-gold"
          >
            {BRAND_PHONE}
          </a>
        </header>
        <main className="mx-auto max-w-lg space-y-4 px-4 pb-16 sm:px-8">
          {company ? (
            <PortalGlassPanel strong className="px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
                Company portal
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {company}
              </h1>
              <p className="mt-2 text-sm text-muted">
                Open trips, tracking, quotes, and history for this company.
              </p>
            </PortalGlassPanel>
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
          <div className="space-y-2 pt-2 text-center text-sm">
            <Link
              to="/quote"
              className="block font-semibold text-gold hover:text-gold-lt"
            >
              Get a rough estimate →
            </Link>
            <Link to="/book" className="block text-ink/70 hover:text-gold">
              Book a trip (no sign-in) →
            </Link>
            <Link to="/" className="block text-ink/55 hover:text-gold">
              ← Back home
            </Link>
          </div>
        </main>
      </PortalAtmosphere>
    )
  }

  return (
    <PortalAtmosphere className="portal-atmosphere--landing">
      <div className="pt-[max(0px,env(safe-area-inset-top))]">
        <PortalInstallBanner variant="glass" density="banner" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <div className="portal-glass-ink rounded-2xl px-3 py-2.5">
          <img
            src={BRAND_LOGO_PATH}
            alt="OnFly Air"
            className="h-8 w-auto max-w-[160px] object-contain"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="portal-glass inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] text-ink"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D32]" aria-hidden />
            24-hr ops ·{' '}
            <span className="font-semibold text-gold">{BRAND_PHONE}</span>
          </a>
          <Link
            to="/login?next=/scratch"
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-ink/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream backdrop-blur hover:border-gold/40"
          >
            Staff login
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl items-start gap-8 px-4 pb-16 pt-2 sm:px-8 lg:grid-cols-2 lg:gap-10 lg:pt-4">
        <section className="space-y-5">
          <PortalGlassPanel strong className="overflow-hidden p-0">
            <div className="relative">
              <img
                src={BRAND_FALCON_CARGO_DETAIL_PATH}
                alt="Loading cargo into an OnFly Falcon aircraft"
                className="h-44 w-full object-cover sm:h-52"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0C0C0E]/55 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
                  {company ? 'Company portal' : 'OnFly Air · Client portal'}
                </p>
              </div>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {company
                  ? company
                  : 'Your freight, in the air and on the screen.'}
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
                {company
                  ? 'Log in with your work email, request a trip, or get a rough estimate — quotes typically come back in 10–15 minutes.'
                  : 'Client login with your work email for live shipments — or book and estimate with no account. Quotes typically come back in 10–15 minutes.'}
              </p>
            </div>
          </PortalGlassPanel>
        </section>

        <section className="space-y-4">
          <PortalOneClickLogin
            variant="glass"
            onSignedIn={props?.onSignedIn}
            nextHref={props?.nextHref ?? undefined}
            expectedClientId={props?.expectedClientId}
            title={company ? `Client login · ${company}` : 'Client login'}
            hint={
              company
                ? domainHint
                : 'Just enter your work email — no password. Opens live tracking, past trips, and booking.'
            }
          />

          {props?.continueTrackHref ? (
            <Link
              to={props.continueTrackHref}
              className="portal-glass flex min-h-14 items-center justify-between gap-4 rounded-2xl px-5 py-4 text-ink transition hover:border-gold/50"
            >
              <div>
                <div className="text-sm font-semibold">
                  Continue tracking your shipment
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Opens the trip from your last tracking link — still no account.
                </p>
              </div>
              <span className="text-xl font-light text-gold" aria-hidden>
                →
              </span>
            </Link>
          ) : null}

          <Link
            to="/quote"
            className="portal-glass flex min-h-[5.5rem] items-center justify-between gap-4 rounded-2xl px-5 py-5 text-ink transition hover:border-gold/55"
          >
            <div>
              <div className="text-lg font-semibold text-gold">
                Request a rough estimate
              </div>
              <p className="mt-0.5 text-sm text-muted">
                Soft pricing from our historical trip data — no account, no
                commitment. Push to a hard quote if it fits.
              </p>
            </div>
            <span className="text-2xl font-light text-gold" aria-hidden>
              →
            </span>
          </Link>

          <Link
            to="/book"
            className="flex min-h-[5.5rem] items-center justify-between gap-4 rounded-2xl bg-gold px-5 py-5 text-ink shadow-[0_12px_40px_rgba(201,162,39,0.35)] transition hover:bg-gold-lt"
          >
            <div>
              <div className="text-lg font-semibold">Book a trip</div>
              <p className="mt-0.5 text-sm text-ink/75">
                No account needed — three quick steps, then we ring the desk
                for a hard quote.
              </p>
            </div>
            <span className="text-2xl font-light" aria-hidden>
              →
            </span>
          </Link>

          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="portal-glass-ink flex flex-col gap-0.5 rounded-2xl px-5 py-4 text-sm text-cream transition hover:border-gold/40"
          >
            <span className="font-semibold text-cream">
              Rather talk to a real person? Call us
            </span>
            <span className="text-cream/55">
              Dispatchers always on call ·{' '}
              <span className="avionic font-semibold text-gold">
                {BRAND_PHONE}
              </span>
            </span>
          </a>
        </section>
      </main>
    </PortalAtmosphere>
  )
}
