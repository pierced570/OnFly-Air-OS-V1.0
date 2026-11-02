/**
 * Public ofaops home — brand + client login first, then Estimate / Book / Call.
 * Staff login is a quiet footer link (desk gate is separate).
 */

import { Link } from 'react-router-dom'
import {
  BRAND_LOGO_LIGHT_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
  BRAND_TAGLINE,
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
        <header className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-6 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
          <Link to="/">
            <img
              src={BRAND_LOGO_LIGHT_PATH}
              alt="OnFly Air"
              className="h-11 w-auto max-w-[220px] object-contain object-left sm:h-12"
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
          <PortalQuickActions compact />
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

      <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-6 sm:px-8">
        <div className="min-w-0">
          <img
            src={BRAND_LOGO_LIGHT_PATH}
            alt="OnFly Air"
            className="h-12 w-auto max-w-[min(100%,280px)] object-contain object-left sm:h-14"
          />
          <p className="mt-1.5 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted sm:block">
            {BRAND_TAGLINE}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="avionic text-sm font-semibold text-ink hover:text-gold"
          >
            {BRAND_PHONE}
          </a>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            24-hr ops
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 pb-20 sm:px-8">
        <section className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            {company ? 'Company portal' : 'Client portal'}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-[2.5rem] sm:leading-tight">
            {company
              ? company
              : 'Your freight, in the air and on the screen.'}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
            {company
              ? 'Sign in for live trips — or estimate, book, or call without an account.'
              : 'Sign in for live shipments — or get a rough estimate, book a trip, or call ops.'}
          </p>
        </section>

        {props?.continueTrackHref ? (
          <Link
            to={props.continueTrackHref}
            className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-ink/15 bg-[#FFFDFA] px-5 py-4 text-ink transition hover:border-ink/35"
          >
            <div>
              <div className="text-sm font-semibold">
                Continue tracking your shipment
              </div>
              <p className="mt-0.5 text-xs text-muted">
                From your last tracking link — no account needed.
              </p>
            </div>
            <span className="text-lg font-semibold text-ink" aria-hidden>
              →
            </span>
          </Link>
        ) : null}

        {/* Client login takes the former hero slot */}
        <section>
          <PortalOneClickLogin
            variant="glass"
            onSignedIn={props?.onSignedIn}
            nextHref={props?.nextHref ?? undefined}
            expectedClientId={props?.expectedClientId}
            title={company ? `Client login · ${company}` : 'Client login'}
            hint={
              company
                ? domainHint
                : 'Work email on file — opens live tracking, past trips, and booking. No password.'
            }
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            No account needed
          </h2>
          <PortalQuickActions />
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-6 text-xs text-muted">
          <a href="https://onflyair.com" className="hover:text-ink">
            onflyair.com
          </a>
          <Link
            to="/login?next=/dispatch"
            className="font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink"
          >
            Staff login
          </Link>
        </footer>
      </main>
    </PortalAtmosphere>
  )
}
