/**
 * /quote — single-page rough estimate, then call or traditional book form.
 */

import { Link } from 'react-router-dom'
import { PortalAtmosphere } from '@/components/PortalGlass'
import { PortalAppNav } from '@/components/PortalAppNav'
import { PortalFastQuote } from '@/components/PortalFastQuote'
import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { usePortalSession } from '@/hooks/usePortalSession'

export default function PortalFastQuotePage() {
  const { signedIn, session } = usePortalSession()

  return (
    <PortalAtmosphere>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Link to="/" className="portal-glass-ink rounded-2xl px-3 py-2">
          <img
            src={BRAND_LOGO_PATH}
            alt="OnFly Air"
            className="h-7 w-auto max-w-[140px] object-contain"
          />
        </Link>
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="portal-glass inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-[11px] font-semibold text-gold"
        >
          {BRAND_PHONE}
        </a>
      </header>

      <main
        className={[
          'mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6',
          signedIn ? 'pb-28 md:pb-8' : 'pb-10',
        ].join(' ')}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link to="/" className="font-semibold text-gold">
            ← Portal
          </Link>
          {signedIn ? (
            <span className="text-xs text-muted">{session?.email}</span>
          ) : (
            <Link
              to="/portal/request?mode=book"
              className="text-xs font-semibold text-ink hover:text-gold"
            >
              Full booking form →
            </Link>
          )}
        </div>

        <div className="portal-glass-strong rounded-2xl px-4 py-5 sm:px-6 sm:py-6">
          <PortalFastQuote email={session?.email} />
        </div>
      </main>

      {signedIn ? <PortalAppNav /> : null}
    </PortalAtmosphere>
  )
}
