/**
 * Client app — Account. Company + sign-out. Never desk staff login.
 */

import { Link } from 'react-router-dom'
import { PortalShell } from '@/components/PortalShell'
import { PortalInstallBanner } from '@/components/PortalInstallBanner'
import { PortalGuestContinue } from '@/components/PortalGuestContinue'
import {
  BRAND_EMAIL,
  BRAND_PHONE,
  BRAND_PHONE_E164,
  dialBrandOps,
} from '@/domain/brand'
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
      <section className="space-y-5">
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

        <div className="space-y-3 rounded-xl border border-[#E5DFD0] bg-white p-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A8680]">
              Work email
            </div>
            <div className="mt-1 text-sm font-medium text-ink">
              {session?.email}
            </div>
          </div>
          {client?.profile.front_desk_phone ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A8680]">
                Your desk
              </div>
              <div className="mt-1 text-sm text-ink">
                {client.profile.front_desk_phone}
              </div>
            </div>
          ) : null}
        </div>

        <PortalInstallBanner variant="cream" />

        <div className="grid gap-2">
          <Link
            to="/portal/request"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#C9A227] px-4 text-sm font-semibold text-[#0C0C0E]"
          >
            Book a trip
          </Link>
          <Link
            to="/portal/history"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#D4CFC0] bg-white px-4 text-sm font-semibold text-ink"
          >
            Trips, POs &amp; invoices
          </Link>
          <button
            type="button"
            onClick={() => dialBrandOps()}
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#D4CFC0] bg-white px-4 text-sm font-semibold text-ink"
          >
            Call 24-hr ops · {BRAND_PHONE}
          </button>
          <a
            href={`mailto:${BRAND_EMAIL}`}
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#D4CFC0] bg-white px-4 text-sm font-semibold text-ink"
          >
            Email {BRAND_EMAIL}
          </a>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="sr-only"
          >
            {BRAND_PHONE}
          </a>
        </div>

        <button
          type="button"
          className="w-full min-h-12 rounded-md text-sm font-semibold text-[#C0392B]"
          onClick={() => {
            void endPortalSession().then(() => setSession(null))
          }}
        >
          Sign out
        </button>
      </section>
    </PortalShell>
  )
}
