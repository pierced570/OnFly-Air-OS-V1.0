/**
 * Count completed trips for an operator (named-insurer eligibility).
 */

import { listTripsStable, type TripStoreRow } from '@/lib/tripStore'

const COMPLETED: ReadonlySet<string> = new Set([
  'delivered',
  'invoiced',
  'closed',
])

const NAMED_INSURER_TRIP_THRESHOLD = 3

export function namedInsurerTripThreshold(): number {
  return NAMED_INSURER_TRIP_THRESHOLD
}

function tripOperatorMatch(
  trip: TripStoreRow,
  operatorId: string,
  operatorName: string,
): boolean {
  const selected = trip.offers.find((o) => o.state === 'selected')
  if (selected) {
    if (selected.operator_id === operatorId) return true
    if (
      operatorName &&
      selected.operator_name.toLowerCase() === operatorName.toLowerCase()
    ) {
      return true
    }
  }
  if (
    trip.quick?.operator_name &&
    operatorName &&
    trip.quick.operator_name.toLowerCase() === operatorName.toLowerCase()
  ) {
    return true
  }
  return false
}

export function countCompletedTripsForOperator(
  operatorId: string,
  operatorName: string,
): number {
  return listTripsStable().filter(
    (t) =>
      COMPLETED.has(t.state) && tripOperatorMatch(t, operatorId, operatorName),
  ).length
}

export function isNamedInsurerEligible(
  operatorId: string,
  operatorName: string,
): boolean {
  return (
    countCompletedTripsForOperator(operatorId, operatorName) >=
    NAMED_INSURER_TRIP_THRESHOLD
  )
}
