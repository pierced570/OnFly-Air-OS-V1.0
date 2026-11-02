/**
 * Guest-friendly continue surface when History / Account need a session.
 * Same Estimate / Book / Call rhythm as the landing — never a login-only dead end.
 */

import { Link } from 'react-router-dom'
import { PortalShell } from '@/components/PortalShell'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import { PortalQuickActions } from '@/components/PortalQuickActions'
import { usePortalSession } from '@/hooks/usePortalSession'

export function PortalGuestContinue(props: {
  title: string
  hint: string
  nextHref: string
}) {
  const { setSession } = usePortalSession()
  return (
    <PortalShell appNav>
      <section className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Client portal
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {props.title}
          </h1>
          <p className="mt-2 text-sm text-muted">{props.hint}</p>
        </div>

        <PortalQuickActions compact />

        <PortalOneClickLogin
          onSignedIn={setSession}
          nextHref={props.nextHref}
          title="Sign in for company trips"
          hint="Verified desk work email — opens History, Account, and every shipment."
        />

        <Link to="/" className="inline-block text-sm font-semibold text-gold">
          ← Trips home
        </Link>
      </section>
    </PortalShell>
  )
}
