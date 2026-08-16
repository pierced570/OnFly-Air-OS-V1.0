/**
 * Explicit sign-in route — magic-link form. Signed-in clients go straight home
 * so login ↔ shipments ↔ track stay one loop.
 */

import { Navigate } from 'react-router-dom'
import { PortalLanding } from '@/components/PortalLanding'
import { usePortalSession } from '@/hooks/usePortalSession'

export default function PortalLoginPage() {
  const { signedIn, loading } = usePortalSession()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0C0E] text-sm text-cream/60">
        Checking session…
      </div>
    )
  }
  if (signedIn) return <Navigate to="/portal" replace />
  return <PortalLanding />
}
