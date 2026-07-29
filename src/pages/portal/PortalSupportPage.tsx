import { PortalShell } from '@/components/PortalShell'
import { BRAND_EMAIL, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'

/** Client portal support — 24-hr ops. */
export default function PortalSupportPage() {
  return (
    <PortalShell>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        Support
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        24-hour operations
      </h1>
      <p className="mt-2 text-sm text-muted">
        A dispatcher answers — not a phone tree. Call or email for status,
        changes, or a new ASAP move.
      </p>
      <div className="mt-6 space-y-3 rounded-md border border-border bg-white p-5">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Phone
          </div>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="avionic text-lg font-semibold text-gold"
          >
            {BRAND_PHONE}
          </a>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Email
          </div>
          <a href={`mailto:${BRAND_EMAIL}`} className="text-ink hover:text-gold">
            {BRAND_EMAIL}
          </a>
        </div>
      </div>
    </PortalShell>
  )
}
