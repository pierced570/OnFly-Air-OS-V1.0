/**
 * Unsigned client gate — two paths only, no login wall.
 * Login comes after details (one-click with the request email).
 */

import { Link } from 'react-router-dom'
import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { PortalInstallBanner } from '@/components/PortalInstallBanner'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import type { PortalSession } from '@/domain/portalAuth'

export function PortalLanding(props?: {
  onSignedIn?: (session: PortalSession) => void
  /** Login-only page (quiet secondary). Default = start with book/quote. */
  loginFocus?: boolean
}) {
  if (props?.loginFocus) {
    return (
      <div
        className="min-h-screen bg-[#0C0C0E] text-cream"
        data-theme="client"
      >
        <header className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
          <Link to="/portal">
            <img
              src={BRAND_LOGO_PATH}
              alt="OnFly Air"
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          </Link>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="text-[11px] font-semibold text-gold"
          >
            {BRAND_PHONE}
          </a>
        </header>
        <main className="mx-auto max-w-lg space-y-4 px-4 pb-16 sm:px-8">
          <PortalOneClickLogin
            variant="dark"
            onSignedIn={props.onSignedIn}
            title="Open your trips"
            hint="Work email — no password. Prefer to start a new move?"
          />
          <Link
            to="/portal"
            className="block text-center text-sm text-cream/60 hover:text-gold"
          >
            ← Back to book or quote
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-[#0C0C0E] text-cream"
      data-theme="client"
    >
      <header className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <img
          src={BRAND_LOGO_PATH}
          alt="OnFly Air"
          className="h-8 w-auto max-w-[160px] object-contain"
        />
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/15 bg-[#141414] px-3 py-1.5 text-[11px] text-cream/85"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D32]" aria-hidden />
          <span className="font-semibold text-gold">{BRAND_PHONE}</span>
        </a>
      </header>

      <main className="mx-auto flex max-w-lg flex-col px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
          OnFly Air
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-cream sm:text-5xl">
          Need a flight or a delivery?
        </h1>
        <p className="mt-3 text-base leading-relaxed text-cream/60">
          No account first. Tell us the trip, get a rough quote, then book —
          login is one tap with your email when you&apos;re ready.
        </p>

        <div className="mt-6">
          <PortalInstallBanner variant="dark" defaultOpen />
        </div>

        <div className="mt-8 space-y-3">
          <Link
            to="/portal/request?mode=book"
            className="flex min-h-[5.5rem] items-center justify-between gap-4 rounded-2xl bg-gold px-5 py-5 text-ink transition hover:bg-gold-lt"
          >
            <div>
              <div className="text-lg font-semibold">
                Request a flight / delivery
              </div>
              <p className="mt-0.5 text-sm text-ink/75">
                Full move — we quote and arrange it.
              </p>
            </div>
            <span className="text-2xl font-light" aria-hidden>
              →
            </span>
          </Link>

          <Link
            to="/portal/request?mode=quote"
            className="flex min-h-[5.5rem] items-center justify-between gap-4 rounded-2xl border border-cream/20 bg-[#141414] px-5 py-5 text-cream transition hover:border-gold/50"
          >
            <div>
              <div className="text-lg font-semibold">Get a rough quote</div>
              <p className="mt-0.5 text-sm text-cream/55">
                Soft pricing now — push to a hard quote when it fits.
              </p>
            </div>
            <span className="text-2xl font-light text-gold" aria-hidden>
              →
            </span>
          </Link>
        </div>

        <p className="mt-8 text-center text-sm text-cream/50">
          Time-critical?{' '}
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="font-semibold text-gold"
          >
            Call {BRAND_PHONE}
          </a>
        </p>

        <div className="mt-10 border-t border-cream/10 pt-6">
          <Link
            to="/portal/login"
            className="block text-center text-sm text-cream/45 hover:text-cream/80"
          >
            Already booked? Open trips with email →
          </Link>
        </div>
      </main>
    </div>
  )
}
