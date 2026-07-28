/**
 * Poll QuickBooks for paid invoices on `invoiced` trips → transition closed.
 * Mock: markMockInvoicePaid; Real: Balance === 0 via invoice_status.
 */

import { createAccountingAdapter } from '@/adapters/accounting'
import {
  listTripsStable,
  safeTransitionTrip,
  mutateTrip,
} from '@/lib/tripStore'

const POLL_MS = 60_000
let started = false
let timer: number | null = null

export async function pollQbPaidInvoices(): Promise<{
  checked: number
  closed: number
}> {
  const acct = createAccountingAdapter()
  let checked = 0
  let closed = 0
  for (const trip of listTripsStable()) {
    if (trip.state !== 'invoiced') continue
    const qbId = trip.invoice?.qb_invoice_id
    if (!qbId) continue
    checked++
    try {
      const status = await acct.invoiceStatus(qbId)
      if (status !== 'paid') continue
      mutateTrip(trip.id, (t) => {
        if (t.invoice) t.invoice.status = 'paid'
        t.events.push({
          at: new Date().toISOString(),
          actor: 'system',
          kind: 'invoice_paid',
          payload: { qb_invoice_id: qbId },
        })
      })
      safeTransitionTrip(trip.id, 'closed', 'system', {
        qb_invoice_id: qbId,
        reason: 'qb_paid',
      })
      closed++
    } catch (e) {
      console.warn('[qb paid poll]', trip.ref, e)
    }
  }
  return { checked, closed }
}

/** Start background poll (desk shell). Idempotent. */
export function startQbPaidPoller(): void {
  if (started || typeof window === 'undefined') return
  started = true
  void pollQbPaidInvoices()
  void import('@/lib/invoiceRetryQueue').then((m) =>
    m.flushInvoiceRetryQueue(),
  )
  timer = window.setInterval(() => {
    void pollQbPaidInvoices()
    void import('@/lib/invoiceRetryQueue').then((m) =>
      m.flushInvoiceRetryQueue(),
    )
  }, POLL_MS)
}

export function stopQbPaidPoller(): void {
  if (timer != null) window.clearInterval(timer)
  timer = null
  started = false
}
