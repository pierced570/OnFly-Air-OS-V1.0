/**
 * Public ofaops home — Pinterest-style glass split:
 * compact logo + light Staff pill · login left · glass-gray actions right.
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
}) {
  const company = (props?.companyName ?? '').trim()
  const domains = (props?.companyDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  const domainHint =
    domains.length > 0
      ? `Use your @${domains[0]} work email — opens ${company || 'this company'} instantly. No password.`
      : 'Work email on file — live tracking, past trips, booking. No password.'

  if (props?.loginFocus) {
    return (
      <PortalAtmosphere className="portal-atmosphere--landing" detail>
        <header className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
          <Link to="/">
            <img
              src={BRAND_LOGO_LIGHT_PATH}
              alt="OnFly Air"
              className="h-7 w-auto max-w-[140px] object-contain object-left"
            />
          </Link>
          <Link
            to="/login?next=/dispatch"
            className="inline-flex min-h-9 items-center rounded-full border border-white/50 bg-white/45 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink backdrop-blur hover:bg-white/65"
          >
            Operations
          </Link>
        </header>
        <main className="mx-auto max-w-lg space-y-5 px-4 pb-16 sm:px-8">
          {company ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/50">
                Company portal
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {company}
              </h1>
            </div>
          ) : null}
          <PortalOneClickLogin
            variant="frost"
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
    <PortalAtmosphere className="portal-atmosphere--landing portal-atmosphere--frost">
      <div className="pt-[max(0px,env(safe-area-inset-top))]">
        <PortalInstallBanner variant="glass" density="banner" />
      </div>

      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link to="/" className="min-w-0 shrink">
          <img
            src={BRAND_LOGO_LIGHT_PATH}
            alt="OnFly Air"
            className="h-7 w-auto max-w-[140px] object-contain object-left sm:h-8 sm:max-w-[155px]"
          />
        </Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="hidden avionic text-xs font-semibold text-ink/70 hover:text-ink sm:inline"
          >
            {BRAND_PHONE}
          </a>
          <Link
            to="/login?next=/dispatch"
            className="inline-flex min-h-9 items-center rounded-full border border-white/55 bg-white/50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink backdrop-blur-md hover:bg-white/70"
          >
            Operations
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-3 sm:px-8 sm:pt-6">
        <div className="grid items-start gap-5 lg:grid-cols-2 lg:items-center lg:gap-7">
          {/* Left — frosted client login */}
          <section className="flex flex-col justify-center space-y-4">
            <div className="px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
                {company ? 'Company portal' : 'Client portal'}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-[1.85rem] sm:leading-snug">
                {company
                  ? company
                  : 'Your freight, in the air and on the screen.'}
              </h1>
            </div>

            <PortalOneClickLogin
              variant="frost"
              onSignedIn={props?.onSignedIn}
              nextHref={props?.nextHref ?? undefined}
              expectedClientId={props?.expectedClientId}
              title={company ? `Client login · ${company}` : 'Client login'}
              hint={domainHint}
            />
          </section>

          {/* Right — glass-gray stacked options (hug content, larger hits) */}
          <section className="flex h-fit flex-col rounded-3xl border border-white/40 bg-white/25 p-4 shadow-[0_20px_60px_rgba(12,12,14,0.1)] backdrop-blur-2xl sm:p-5">
            <h2 className="mb-3 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">
              No account needed
            </h2>
            <PortalQuickActions stacked />
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-ink/45">
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
