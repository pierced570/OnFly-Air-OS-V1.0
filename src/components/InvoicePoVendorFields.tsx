/**
 * PO # + optional vendor # for send-invoice surfaces.
 * Shows last-used PO (with trip) and +1 suggestion under the PO box.
 */

import { formatInvoicePoHint } from '@/domain/invoicePoHint'

type Props = {
  poValue: string
  onPoChange: (next: string) => void
  onPoCommit?: () => void
  suggestedPo: string
  lastPo: string | null
  lastPoTripRef?: string | null
  /** Optional — always shown; not required to send. */
  vendorValue: string
  onVendorChange: (next: string) => void
  onVendorCommit?: () => void
  /** When true, emphasize that this client often needs a vendor #. */
  vendorRecommended?: boolean
  onUseSuggestedPo?: () => void
  className?: string
  inputClassName?: string
}

const defaultInput =
  'mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 font-mono text-sm text-cream'

export function InvoicePoVendorFields({
  poValue,
  onPoChange,
  onPoCommit,
  suggestedPo,
  lastPo,
  lastPoTripRef,
  vendorValue,
  onVendorChange,
  onVendorCommit,
  vendorRecommended = false,
  onUseSuggestedPo,
  className,
  inputClassName = defaultInput,
}: Props) {
  const hint = formatInvoicePoHint({
    lastPo,
    lastPoTripRef,
    suggestedPo,
  })

  return (
    <div
      className={[
        'space-y-3 rounded-md border border-gold/35 bg-gold/5 p-2.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gold">
        Invoice identifiers
      </div>
      <label className="block text-xs text-muted">
        PO # <span className="text-late">(required)</span>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            type="text"
            className={`min-w-[10rem] flex-1 ${inputClassName}`}
            value={poValue}
            placeholder={suggestedPo || 'Client PO / DocNumber'}
            onChange={(e) => onPoChange(e.target.value)}
            onBlur={() => onPoCommit?.()}
            aria-describedby="invoice-po-hint"
          />
          {onUseSuggestedPo ? (
            <button
              type="button"
              className="rounded border border-gold/40 px-2.5 py-1.5 text-[11px] text-gold hover:bg-gold/10"
              onClick={onUseSuggestedPo}
            >
              Use {suggestedPo}
            </button>
          ) : null}
        </div>
        <span
          id="invoice-po-hint"
          className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-muted"
        >
          {hint}
        </span>
      </label>
      <label className="block text-xs text-muted">
        Vendor #{' '}
        <span className="font-normal normal-case tracking-normal text-muted">
          {vendorRecommended ? '(recommended for this client)' : '(optional)'}
        </span>
        <input
          type="text"
          className={inputClassName}
          value={vendorValue}
          placeholder="If the client requires your vendor #"
          onChange={(e) => onVendorChange(e.target.value)}
          onBlur={() => onVendorCommit?.()}
        />
      </label>
    </div>
  )
}
