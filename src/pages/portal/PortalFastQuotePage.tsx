/**
 * /quote — guest rough estimate (desktop) or AOG urgent sheet (mobile).
 * Signed-in clients land on the in-portal Quote tab instead.
 */

import { Link, Navigate } from 'react-router-dom'
import { PortalFastQuote } from '@/components/PortalFastQuote'
import { PortalGlassGuestShell } from '@/components/PortalGlassGuestShell'
import { PortalGuestAogSheet } from '@/components/PortalGuestAogSheet'
import { usePortalSession } from '@/hooks/usePortalSession'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export default function PortalFastQuotePage() {
  const { signedIn, session, loading } = usePortalSession()
  const isNarrow = useMediaQuery('(max-width: 960px)')

  if (!loading && signedIn) {
    return <Navigate to="/?panel=quote" replace />
  }

  if (isNarrow) {
    return (
      <PortalGuestAogSheet
        signedIn={signedIn}
        loginHref="/portal/login?next=/?panel=quote"
        email={session?.email}
      />
    )
  }

  return (
    <PortalGlassGuestShell
      kicker="Rough estimate"
      title="Get an idea of costs"
      subtitle="Airports in, ballpark out — then call ops or send a full booking request."
    >
      <div style={{ marginBottom: 14, textAlign: 'right' }}>
        <Link
          to="/book"
          style={{
            font: '500 12.5px/1 var(--ofa-font)',
            color: 'var(--ofa-gold-2)',
            textDecoration: 'none',
          }}
        >
          Full booking form →
        </Link>
      </div>
      <PortalFastQuote email={session?.email} />
      {!signedIn ? (
        <p
          style={{
            marginTop: 16,
            font: '400 12px/1.4 var(--ofa-font)',
            color: 'var(--ofa-mute)',
          }}
        >
          Already a client?{' '}
          <Link
            to="/portal/login?next=/?panel=quote"
            style={{ color: 'var(--ofa-gold-2)', fontWeight: 500 }}
          >
            Sign in
          </Link>
        </p>
      ) : null}
    </PortalGlassGuestShell>
  )
}
