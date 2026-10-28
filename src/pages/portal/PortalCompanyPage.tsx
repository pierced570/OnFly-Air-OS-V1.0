/**
 * Company-designated portal gate — /portal/c/:slug
 * Same two-column client portal stack as /portal, scoped to the company.
 * Guests book/quote without account; returning clients get a magic-link email.
 */

import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { PortalLanding } from '@/components/PortalLanding'
import { usePortalSession } from '@/hooks/usePortalSession'
import {
  getClientByPortalSlug,
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
            rough quote, or open shipments with a sign-in link.
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

  return (
    <PortalLanding
      onSignedIn={setSession}
      companyName={client.name}
      companyDomains={client.profile.allowed_email_domains}
      expectedClientId={client.id}
      nextHref={nextHref}
    />
  )
}
