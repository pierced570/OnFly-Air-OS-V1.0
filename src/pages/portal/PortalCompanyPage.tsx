/**
 * Company-designated portal gate — /portal/c/:slug
 * Staff share this URL so clients land on their company, then one-click login
 * or book/quote without an account first.
 */

import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import { usePortalSession } from '@/hooks/usePortalSession'
import {
  getClientByPortalSlug,
  portalSlugFromClient,
  safePortalNextPath,
} from '@/lib/portalShareLinks'

export default function PortalCompanyPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const { signedIn, loading, setSession } = usePortalSession()
  const nextHref = safePortalNextPath(params.get('next'))
  const client = getClientByPortalSlug(slug)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0C0E] text-sm text-cream/60">
        Checking session…
      </div>
    )
  }

  if (!client) {
    return (
      <div
        className="min-h-screen bg-[#0C0C0E] text-cream"
        data-theme="client"
      >
        <main className="mx-auto max-w-lg space-y-4 px-4 py-16 sm:px-8">
          <h1 className="text-2xl font-semibold">Company portal not found</h1>
          <p className="text-sm text-cream/60">
            This company link isn&apos;t set up yet. You can still book or get a
            rough quote, or sign in with your work email.
          </p>
          <Link
            to="/portal"
            className="inline-flex min-h-12 items-center rounded-lg bg-gold px-4 text-sm font-semibold text-ink"
          >
            Go to OnFly portal
          </Link>
        </main>
      </div>
    )
  }

  if (signedIn) {
    return <Navigate to={nextHref ?? '/portal'} replace />
  }

  const domains = client.profile.allowed_email_domains ?? []
  const domainHint =
    domains.length > 0
      ? `One tap with your @${domains[0]} work email — no password.`
      : 'One tap with your work email — no password.'
  const slugLabel = portalSlugFromClient({
    id: client.id,
    name: client.name,
    profile: client.profile,
  })

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-cream" data-theme="client">
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

      <main className="mx-auto flex max-w-lg flex-col px-4 pb-16 pt-4 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
          {slugLabel} · OnFly Air
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-cream">
          {client.name}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-cream/60">
          No account first — request a flight or get a rough quote. Already
          moving with us? Open your trips with one tap.
        </p>

        <div className="mt-10 space-y-3">
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

        <div className="mt-10">
          <PortalOneClickLogin
            variant="dark"
            onSignedIn={setSession}
            nextHref={nextHref ?? '/portal'}
            expectedClientId={client.id}
            title={`Open ${client.name} trips`}
            hint={domainHint}
          />
        </div>
      </main>
    </div>
  )
}
