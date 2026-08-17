/**
 * Desk helper — gather click-to-call contacts for a live trip.
 */

import {
  buildTripContactLines,
  groupTripContactLines,
  type TripContactLine,
} from '@/domain/tripContacts'
import { getClient } from '@/lib/clientStore'
import {
  resolveOperatorContacts,
  type TripStoreRow,
} from '@/lib/tripStore'

export function listTripContactsForDesk(trip: TripStoreRow): {
  lines: TripContactLine[]
  client: TripContactLine[]
  operator: TripContactLine[]
  crew: TripContactLine[]
} {
  const client = trip.client_id ? getClient(trip.client_id) : undefined
  const bookedOffers = trip.offers.filter(
    (o) => o.state === 'selected' || o.state === 'quoted',
  )
  const primary =
    bookedOffers.find((o) => o.state === 'selected') ??
    bookedOffers[0] ??
    null

  const operatorExtras: Array<{
    id: string
    name: string
    company: string
    phone: string
    roleLabel?: string
  }> = []

  if (primary) {
    const resolved = resolveOperatorContacts(
      primary.operator_id,
      primary.operator_name,
    )
    if (
      resolved.contact_cell &&
      resolved.contact_cell !== primary.contact_cell
    ) {
      operatorExtras.push({
        id: `resolved-${primary.operator_id}`,
        name: primary.operator_name,
        company: primary.operator_name,
        phone: resolved.contact_cell,
        roleLabel: 'Operator ops',
      })
    }
  } else if (trip.quick?.operator_name) {
    const resolved = resolveOperatorContacts(
      trip.quick.operator_name,
      trip.quick.operator_name,
    )
    if (resolved.contact_cell) {
      operatorExtras.push({
        id: 'quick-op',
        name: trip.quick.operator_name,
        company: trip.quick.operator_name,
        phone: resolved.contact_cell,
        roleLabel: 'Charter operator',
      })
    }
  }

  const lines = buildTripContactLines({
    clientName: trip.client_name ?? client?.name ?? null,
    client: client
      ? {
          name: client.name,
          profile: client.profile,
          contacts: client.contacts,
        }
      : null,
    participants: trip.participants,
    operatorOffers: bookedOffers.map((o) => ({
      id: o.id,
      operator_name: o.operator_name,
      contact_cell: o.contact_cell,
      contact_cell_is_mock: o.contact_cell_is_mock,
    })),
    operatorExtras,
  })

  return { lines, ...groupTripContactLines(lines) }
}
