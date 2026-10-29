/**
 * Guest-friendly continue surface when History / Account need a session.
 * Always offers Request another trip — never a login-only dead end.
 */

import { Link } from 'react-router-dom'
import { PortalShell } from '@/components/PortalShell'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import { usePortalSession } from '@/hooks/usePortalSession'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'

export function PortalGuestContinue(props: {
  title: string
  hint: string
  nextHref: string
}) {
  const { setSession } = usePortalSession()
  return (
    <PortalShell appNav>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        Client portal
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">{props.title}</h1>
      <p className="mt-2 text-sm text-muted">{props.hint}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/portal/request?mode=book"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-gold px-4 text-sm font-semibold text-ink hover:bg-gold-lt"
        >
          Request another trip
        </Link>
        <Link
          to="/portal/request?mode=quote"
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-ink"
        >
          Get a rough estimate
        </Link>
      </div>

      <a
        href={`tel:${BRAND_PHONE_E164}`}
        className="mt-3 flex w-full flex-col gap-0.5 rounded-xl border border-ink/15 bg-[#141414] px-5 py-4 text-left transition hover:border-gold/40"
      >
        <span className="text-sm font-semibold text-cream">
          Rather talk to a real person? Call now
        </span>
        <span className="text-xs text-cream/55">
          Dispatchers always on call ·{' '}
          <span className="avionic font-semibold text-gold">
            {BRAND_PHONE}
          </span>
        </span>
      </a>

      <div className="mt-8">
        <PortalOneClickLogin
          onSignedIn={setSession}
          nextHref={props.nextHref}
          title="Sign in for company trips"
          hint="Verified desk work email — opens History, Account, and every shipment."
        />
      </div>

      <Link to="/portal" className="mt-6 inline-block text-sm font-semibold text-gold">
        ← Trips home
      </Link>
    </PortalShell>
  )
}
