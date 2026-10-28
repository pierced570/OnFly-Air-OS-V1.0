/**
 * Quiet secondary sign-in — magic-link email (same stack as /portal).
 * Supports ?company=slug and ?next=/portal/... for desk outreach links.
 * Primary path remains book/quote without login first.
 */

import { Navigate, useSearchParams } from 'react-router-dom'
import { PortalLanding } from '@/components/PortalLanding'
import { usePortalSession } from '@/hooks/usePortalSession'
import {
  getClientByPortalSlug,
  safePortalNextPath,
} from '@/lib/portalShareLinks'

export default function PortalLoginPage() {
  const { signedIn, loading, setSession } = usePortalSession()
  const [params] = useSearchParams()
  const companySlug = (params.get('company') ?? '').trim()
  const nextHref = safePortalNextPath(params.get('next'))
  const company = companySlug ? getClientByPortalSlug(companySlug) : null

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0C0E] text-sm text-cream/60">
        Checking session…
      </div>
    )
  }
  if (signedIn) {
    return <Navigate to={nextHref ?? '/portal'} replace />
  }
  return (
    <PortalLanding
      loginFocus
      onSignedIn={setSession}
      companyName={company?.name}
      companyDomains={company?.profile.allowed_email_domains}
      expectedClientId={company?.id}
      nextHref={nextHref}
    />
  )
}
