/**
 * Pending-trip quote options — same cards as /accept + hard-quote email,
 * embedded in the glass portal detail pane.
 */

import { Link } from 'react-router-dom'
import { ClientLogisticsQuotePreview } from '@/components/ClientLogisticsQuotePreview'
import type { PortalTripQuoteBundle } from '@/domain/portalTripQuotes'

export function PortalTripQuotePanel(props: {
  bundle: PortalTripQuoteBundle
  /** Compact embed inside portal detail (no outer page chrome). */
  compact?: boolean
}) {
  const { bundle } = props
  if (!bundle.hasOptions) return null

  return (
    <div className="ofa-portal-quote-options">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div>
          <div className="g-kicker">Quote options</div>
          <div
            style={{
              font: '500 15px/1.25 var(--ofa-font)',
              letterSpacing: '-.015em',
              color: 'var(--ofa-ink)',
              marginTop: 6,
            }}
          >
            Same options we emailed you
          </div>
        </div>
        {bundle.acceptHref ? (
          <Link
            to={bundle.acceptHref}
            className="g-btn g-btn--sm"
            style={{ paddingRight: 42, textDecoration: 'none' }}
          >
            Open quote
          </Link>
        ) : null}
      </div>
      <ClientLogisticsQuotePreview
        title={bundle.title}
        options={bundle.options}
        missionChips={bundle.missionChips}
        refLabel={bundle.refLabel}
        portalAcceptUrl={bundle.acceptHref}
        interactive={false}
        className="ofa-quote-embed"
        intro={
          bundle.options.length === 1
            ? 'All-in price · taxes & fees included. Open the quote to Accept, Deny, or request a change.'
            : `${bundle.options.length} options · all-in prices. Open the quote to Accept, Deny, or request a change.`
        }
      />
    </div>
  )
}
