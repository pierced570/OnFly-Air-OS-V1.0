/**
 * Company-designated portal gate — /portal/c/:slug
 * Same glass client portal stack as /portal, scoped to the company.
 * Guests book/quote without account; returning clients enter a verified desk email.
 */

import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { PortalAtmosphere, PortalGlassPanel } from '@/components/PortalGlass'
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
      <PortalAtmosphere className="portal-atmosphere--landing flex items-center justify-center">
        <div className="portal-glass-strong rounded-2xl px-5 py-4 text-sm text-muted">
          Checking session…
        </div>
      </PortalAtmosphere>
    )
  }

  if (!client) {
    return (
      <PortalAtmosphere className="portal-atmosphere--landing" detail>
        <main className="mx-auto max-w-lg space-y-4 px-4 py-16 sm:px-8">
          <PortalGlassPanel strong className="px-5 py-6">
            <h1 className="text-2xl font-semibold text-ink">
              Company portal not found
            </h1>
            <p className="mt-2 text-sm text-muted">
              This company link isn&apos;t set up yet. You can still book or get a
              rough quote, or open shipments with a verified desk email.
            </p>
            <Link
              to="/portal"
              className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-gold px-4 text-sm font-semibold text-ink shadow-[0_10px_28px_rgba(201,162,39,0.28)]"
            >
              Go to OnFly portal
            </Link>
          </PortalGlassPanel>
        </main>
      </PortalAtmosphere>
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
