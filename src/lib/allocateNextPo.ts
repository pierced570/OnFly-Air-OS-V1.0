/**
 * Next PO for a client = max(QuickBooks last, local last_po) + 1.
 */

import { createAccountingAdapter } from '@/adapters/accounting'
import { extractPoNumeric, nextPoNumber } from '@/domain/qbInvoice'
import {
  getClient,
  guessPoPrefix,
  listClients,
  recordPoUsed,
} from '@/lib/clientStore'

function initialsPrefix(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  return name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'OFA'
}

/** Allocate and persist the next PO for this client. */
export async function allocateNextPoForClient(opts: {
  clientId?: string | null
  clientName: string
  tripRef?: string | null
}): Promise<string> {
  const name = opts.clientName.trim() || 'Client'
  const client =
    (opts.clientId ? getClient(opts.clientId) : null) ??
    listClients().find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
    null

  const acct = createAccountingAdapter()
  let qbLast: number | null = null
  try {
    qbLast = await acct.getLastPoNumeric(name)
  } catch (e) {
    console.warn('[po] getLastPoNumeric failed — using local last_po', e)
  }
  const localLast = extractPoNumeric(client?.last_po ?? null)
  const lastNumeric =
    qbLast == null && localLast == null
      ? null
      : Math.max(qbLast ?? 0, localLast ?? 0)

  const prefix =
    client?.po_prefix?.trim() ||
    guessPoPrefix(client?.last_po) ||
    initialsPrefix(name)

  const po = nextPoNumber({ lastNumeric, prefix })
  if (client) recordPoUsed(client.id, po, { tripRef: opts.tripRef })
  return po
}
