/**
 * Durable local retry queue for failed QuickBooks invoice creates.
 * Delivery never blocks on QB — failures land here and flush later.
 */

const KEY = 'onfly.qbInvoiceRetry.v1'

export type InvoiceRetryItem = {
  tripId: string
  enqueuedAt: string
  attempts: number
  lastError: string
}

type Listener = () => void
const listeners = new Set<Listener>()

function load(): InvoiceRetryItem[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as InvoiceRetryItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(rows: InvoiceRetryItem[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(rows))
  for (const l of listeners) l()
}

export function subscribeInvoiceRetry(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listInvoiceRetries(): InvoiceRetryItem[] {
  return load()
}

export function enqueueInvoiceRetry(tripId: string, error: string): void {
  const rows = load().filter((r) => r.tripId !== tripId)
  rows.push({
    tripId,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: error.slice(0, 500),
  })
  save(rows)
}

export function dequeueInvoiceRetry(tripId: string): void {
  save(load().filter((r) => r.tripId !== tripId))
}

export function bumpInvoiceRetry(tripId: string, error: string): void {
  const rows = load().map((r) =>
    r.tripId === tripId
      ? {
          ...r,
          attempts: r.attempts + 1,
          lastError: error.slice(0, 500),
        }
      : r,
  )
  save(rows)
}

/** Flush queue — creates missing invoices; never throws. */
export async function flushInvoiceRetryQueue(): Promise<{
  ok: number
  failed: number
}> {
  const { createInvoiceForTrip, getTrip } = await import('@/lib/tripStore')
  let ok = 0
  let failed = 0
  for (const item of load()) {
    const trip = getTrip(item.tripId)
    if (!trip) {
      dequeueInvoiceRetry(item.tripId)
      continue
    }
    if (trip.invoice) {
      dequeueInvoiceRetry(item.tripId)
      ok++
      continue
    }
    try {
      const inv = await createInvoiceForTrip(item.tripId, { skipEmail: false })
      if (inv) {
        dequeueInvoiceRetry(item.tripId)
        ok++
      } else {
        bumpInvoiceRetry(item.tripId, 'create returned null')
        failed++
      }
    } catch (e) {
      bumpInvoiceRetry(
        item.tripId,
        e instanceof Error ? e.message : String(e),
      )
      failed++
    }
  }
  return { ok, failed }
}
