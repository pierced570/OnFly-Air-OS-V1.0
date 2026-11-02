/**
 * /quote — single-page rough estimate, then call or traditional book form.
 * Uses the same signed-in chrome as the rest of the client app.
 */

import { Link } from 'react-router-dom'
import { PortalFastQuote } from '@/components/PortalFastQuote'
import { PortalShell } from '@/components/PortalShell'
import { usePortalSession } from '@/hooks/usePortalSession'

export default function PortalFastQuotePage() {
  const { signedIn, session } = usePortalSession()

  return (
    <PortalShell
      appNav={signedIn}
      headerActions={
        signedIn ? (
          <span className="hidden text-cream/60 md:inline">{session?.email}</span>
        ) : (
          <Link to="/book" className="text-gold hover:text-gold-lt">
            Full booking form
          </Link>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link to="/" className="font-semibold text-gold">
          ← Portal
        </Link>
        {!signedIn ? (
          <Link to="/portal/login" className="text-xs text-muted hover:text-ink">
            Client login
          </Link>
        ) : null}
      </div>

      <div className="portal-glass-strong rounded-2xl px-4 py-5 sm:px-6 sm:py-6">
        <PortalFastQuote email={session?.email} />
      </div>
    </PortalShell>
  )
}
