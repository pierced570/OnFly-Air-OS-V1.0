/**
 * Invoice PO hint copy — last used (+ trip) and +1 suggestion.
 * Pure TypeScript; no React / Supabase.
 */

export function tripRefLabel(trip: {
  code?: string | null
  ref: number
}): string {
  const code = (trip.code ?? '').trim()
  return code || `T-${trip.ref}`
}

/** Human hint under the PO field on send-invoice / QD. */
export function formatInvoicePoHint(opts: {
  lastPo: string | null | undefined
  lastPoTripRef?: string | null
  suggestedPo: string
}): string {
  const suggested = opts.suggestedPo.trim() || '00001'
  const last = opts.lastPo?.trim()
  if (!last) {
    return `No prior PO — suggesting ${suggested}`
  }
  const tripBit = opts.lastPoTripRef?.trim()
    ? ` on ${opts.lastPoTripRef.trim()}`
    : ''
  return `Last used ${last}${tripBit} · suggesting ${suggested}`
}
