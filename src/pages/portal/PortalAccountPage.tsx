/**
 * Client app — Account. Company + sign-out. Never desk staff login.
 * Glass panels over Falcon atmosphere (via PortalShell).
 */

import { Link } from 'react-router-dom'
import { PortalShell } from '@/components/PortalShell'
import { PortalGuestContinue } from '@/components/PortalGuestContinue'
import { PortalQuickActions } from '@/components/PortalQuickActions'
import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'
import { usePortalSession } from '@/hooks/usePortalSession'
import { endPortalSession } from '@/lib/portalAuth'
import { getPortalClient } from '@/lib/clientOnboardStore'
import { listClients, subscribeClients } from '@/lib/clientStore'
import { useSyncExternalStore } from 'react'

export default function PortalAccountPage() {
  useSyncExternalStore(subscribeClients, listClients, listClients)
  const { session, loading, signedIn, setSession } = usePortalSession()
  const client = getPortalClient()

  if (loading) {
    return (
      <PortalShell>
        <p className="text-sm text-muted">Checking session…</p>
      </PortalShell>
    )
  }

  if (!signedIn) {
    return (
      <PortalGuestContinue
        title="Sign in for account"
        hint="Company profile and sign-out need a verified desk email. Requesting a trip never requires an account."
        nextHref="/portal/account"
      />
    )
  }

  return (
    <PortalShell
      appNav
      headerActions={
        <button
          type="button"
          className="text-gold hover:text-gold-lt"
          onClick={() => {
            void endPortalSession().then(() => setSession(null))
          }}
        >
          Sign out
        </button>
      }
    >
      <section className="space-y-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Account
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {client?.name?.trim() || 'Your company'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in with your work email — separate from OnFly dispatch
            logins.
          </p>
        </div>

        <div className="portal-glass-strong grid gap-4 rounded-2xl p-5 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Work email
            </div>
            <div className="mt-1 text-sm font-medium text-ink">
              {session?.email}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Your desk
            </div>
            <div className="mt-1 text-sm text-ink">
              {client?.profile.front_desk_phone?.trim() || '—'}
            </div>
          </div>
        </div>

        <PortalQuickActions compact />

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/portal/history"
            className="portal-glass-row inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink"
          >
            Trips, POs &amp; invoices
          </Link>
          <a
            href={`mailto:${BRAND_EMAIL}`}
            className="portal-glass-row inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink"
          >
            Email {BRAND_EMAIL}
          </a>
        </div>

        <button
          type="button"
          className="w-full min-h-12 rounded-xl text-sm font-semibold text-[#C0392B]"
          onClick={() => {
            void endPortalSession().then(() => setSession(null))
          }}
        >
          Sign out
        </button>

        <p className="text-center text-xs text-muted">
          24-hr ops · <span className="avionic text-gold">{BRAND_PHONE}</span>
        </p>
      </section>
    </PortalShell>
  )
}
