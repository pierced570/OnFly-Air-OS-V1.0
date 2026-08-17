/**
 * Last PO for a client = max(client.last_po, trips, financials ledger).
 * Backfills client.last_po when history is ahead of the directory field.
 */

import {
  normalizeClientPo,
  pickLatestClientPo,
  type ClientPoCandidate,
  type ResolvedClientLastPo,
} from '@/domain/clientLastPo'
import { clientDirectoryNamesMatch } from '@/domain/clientExportImport'
import { tripRefLabel } from '@/domain/invoicePoHint'
import { resolveTripPoNumber } from '@/domain/tripPo'
import {
  getClient,
  recordPoUsed,
  suggestNextPo,
} from '@/lib/clientStore'
import { listFinancials } from '@/lib/financialsStore'
import { listTripsStable } from '@/lib/tripStore'

export type ClientLastPoHint = {
  lastPo: string | null
  lastPoTripRef: string | null
  suggestedPo: string
}

function tripMatchesClient(
  trip: { client_id?: string | null },
  clientId: string,
  supabaseId: string | null | undefined,
): boolean {
  const cid = trip.client_id?.trim()
  if (!cid) return false
  if (cid === clientId) return true
  if (supabaseId && cid === supabaseId) return true
  return false
}

/** Gather PO candidates from directory + trips + financials for one client. */
export function collectClientPoCandidates(clientId: string): ClientPoCandidate[] {
  const client = getClient(clientId)
  if (!client) return []

  const out: ClientPoCandidate[] = []

  if (client.last_po?.trim()) {
    out.push({
      po: client.last_po,
      tripRef: client.profile.last_po_trip_ref ?? null,
      // No artificial future date — dated ledger / trip rows win when newer.
      sortKey: null,
    })
  }

  for (const trip of listTripsStable()) {
    if (!tripMatchesClient(trip, client.id, client.supabase_id)) continue
    const po = resolveTripPoNumber(trip)
    if (!po) continue
    out.push({
      po,
      tripRef: tripRefLabel(trip),
      sortKey: trip.promised_delivery || trip.ready_label || trip.events?.[0]?.at || null,
    })
  }

  const name = client.name.trim()
  if (name) {
    const exact: ClientPoCandidate[] = []
    const soft: ClientPoCandidate[] = []
    for (const row of listFinancials()) {
      const cn = (row.client_name ?? '').trim()
      if (!cn) continue
      const po = (row.operator_po || row.po_number || '').trim()
      if (!po) continue
      const cand: ClientPoCandidate = {
        po,
        tripRef: null,
        sortKey: row.date_of_flight,
      }
      if (cn.toLowerCase() === name.toLowerCase()) exact.push(cand)
      else if (clientDirectoryNamesMatch(cn, name)) soft.push(cand)
    }
    // Exact ledger name wins — soft-match (PSA ↔ PSA Airlines) is fallback only.
    out.push(...(exact.length ? exact : soft))
  }

  return out
}

/**
 * Best prior PO for this client from directory + trip + ledger history.
 * When `sync` is true and history beats `client.last_po`, backfills via recordPoUsed.
 */
export function resolveClientLastPo(
  clientId: string,
  opts?: { sync?: boolean },
): ResolvedClientLastPo | null {
  const client = getClient(clientId)
  if (!client) return null

  const picked = pickLatestClientPo(collectClientPoCandidates(clientId))
  if (!picked) return null

  if (opts?.sync) {
    const stored = normalizeClientPo(client.last_po)
    if (stored !== picked.lastPo) {
      recordPoUsed(clientId, picked.lastPo, {
        tripRef: picked.tripRef,
      })
    } else if (
      picked.tripRef &&
      !(client.profile.last_po_trip_ref ?? '').trim()
    ) {
      recordPoUsed(clientId, picked.lastPo, { tripRef: picked.tripRef })
    }
  }

  return picked
}

/** Hint fields for Quick Dispatch / invoice PO inputs. */
export function clientLastPoHint(
  clientId: string,
  opts?: { sync?: boolean },
): ClientLastPoHint {
  const resolved = resolveClientLastPo(clientId, opts)
  const lastPo = resolved?.lastPo ?? null
  return {
    lastPo,
    lastPoTripRef: resolved?.tripRef ?? null,
    suggestedPo: suggestNextPo(lastPo),
  }
}
