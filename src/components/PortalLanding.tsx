/**
 * Unsigned client portal gate — two-column dark hero matching the existing
 * client portal: features left, verified-email sign-in + request CTAs right.
 * Returning clients: enter desk-verified work email → instant company portal.
 * Guests: book/quote with no account.
 */

import { Link } from 'react-router-dom'
import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import type { PortalSession } from '@/domain/portalAuth'

const FEATURES = [
  {
    n: '1',
    title: 'Live position & ETA',
    body: 'Tail number, wheels-up, landing and delta against plan.',
  },
  {
    n: '2',
    title: 'Door-to-door visibility',
    body: 'Pickup, FBO handoffs and final delivery on one timeline.',
  },
  {
    n: '3',
    title: 'Verified work email',
    body: 'Emails on your company desk open the right portal — no password or magic link.',
  },
] as const

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
          {company ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
                Company portal
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-cream">
                {company}
              </h1>
              <p className="mt-2 text-sm text-cream/55">
                Open trips, tracking, quotes, and history for this company.
              </p>
            </div>
          ) : null}
          <PortalOneClickLogin
            variant="dark"
            onSignedIn={props.onSignedIn}
            nextHref={props.nextHref ?? undefined}
            expectedClientId={props.expectedClientId}
            title={company ? `Sign in to ${company}` : 'See your shipments'}
            hint={
              company
                ? domainHint
                : 'Enter a work email verified on your company desk — we route you to the right portal.'
            }
          />
          <div className="space-y-2 pt-2 text-center text-sm">
            <Link
              to="/book"
              className="block font-semibold text-gold hover:text-gold-lt"
            >
              Request a trip (no sign-in) →
            </Link>
            <Link
              to="/quote"
              className="block text-cream/70 hover:text-gold"
            >
              Get a rough quote (no account) →
            </Link>
            <Link
              to="/portal"
              className="block text-cream/60 hover:text-gold"
            >
              ← Back to portal
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-[#0C0C0E] text-cream"
      data-theme="client"
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
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
          24-hr ops ·{' '}
          <span className="font-semibold text-gold">{BRAND_PHONE}</span>
        </a>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-4 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:pt-10">
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            {company ? 'Company portal' : 'Client portal'}
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-cream sm:text-5xl">
            {company
              ? company
              : 'Your freight, in the air and on the screen.'}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-cream/60">
            {company
              ? 'Request a trip without an account, or open company shipments with a verified work email. Quotes typically come back in 10–15 minutes.'
              : 'Request a trip or rough quote without an account — or open live shipments with a verified work email from your company desk. Quotes typically come back in 10–15 minutes.'}
          </p>
          <ol className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.n} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 text-sm font-semibold text-gold">
                  {f.n}
                </span>
                <div>
                  <div className="font-semibold text-cream">{f.title}</div>
                  <p className="mt-0.5 text-sm text-cream/55">{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <PortalOneClickLogin
            variant="dark"
            onSignedIn={props?.onSignedIn}
            nextHref={props?.nextHref ?? undefined}
            expectedClientId={props?.expectedClientId}
            title={company ? `See ${company} shipments` : 'See your shipments'}
            hint={
              company
                ? domainHint
                : 'Enter your work email to open your company portal — no password or magic link.'
            }
          />

          <Link
            to="/book"
            className="flex min-h-[5.5rem] items-center justify-between gap-4 rounded-2xl bg-gold px-5 py-5 text-ink transition hover:bg-gold-lt"
          >
            <div>
              <div className="text-lg font-semibold">Request a trip</div>
              <p className="mt-0.5 text-sm text-ink/75">
                No account needed — three quick steps, then we quote it.
              </p>
            </div>
            <span className="text-2xl font-light" aria-hidden>
              →
            </span>
          </Link>

          <Link
            to="/quote"
            className="flex items-center justify-between gap-4 rounded-2xl border border-cream/20 bg-[#141414] px-5 py-4 text-cream transition hover:border-gold/50"
          >
            <div>
              <div className="text-base font-semibold">Get a rough quote</div>
              <p className="mt-0.5 text-sm text-cream/55">
                Soft pricing now — no account needed (/quote).
              </p>
            </div>
            <span className="text-xl font-light text-gold" aria-hidden>
              →
            </span>
          </Link>

          <div className="rounded-2xl border border-cream/10 bg-[#141414] px-5 py-4 text-sm text-cream/65">
            Time-critical right now? Call 24-hr ops at{' '}
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="font-semibold text-gold"
            >
              {BRAND_PHONE}
            </a>{' '}
            and we&apos;ll build the request with you.
          </div>
        </section>
      </main>
    </div>
  )
}
