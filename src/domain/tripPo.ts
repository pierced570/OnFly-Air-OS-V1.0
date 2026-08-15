/**
 * Trip purchase-order helpers — desk enters the real client PO.
 * Never invent a DocNumber like CLI0001 during client accept.
 */

export type TripPoSource = {
  po_number?: string | null
  quick?: { po?: string | null } | null
}

/** Resolved PO for invoice / ETA / booking docs, or null if none yet. */
export function resolveTripPoNumber(trip: TripPoSource): string | null {
  const po = trip.po_number?.trim() || trip.quick?.po?.trim() || ''
  return po || null
}

/** True when the trip has a non-empty PO ready for QB / client docs. */
export function tripHasPoNumber(trip: TripPoSource): boolean {
  return resolveTripPoNumber(trip) != null
}
