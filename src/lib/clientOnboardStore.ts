/**
 * Public customer onboarding → ClientProfile + portal session.
 * Writes the same ClientProfile fields as Admin ClientWizard + Clients directory.
 */

import {
  payTermsLabel,
  resolvePeople,
  rulesFromOnboardDraft,
  validateClientOnboard,
  type ClientOnboardDraft,
} from '@/domain/clientOnboard'
import {
  addClient,
  getClient,
  type ClientProfile,
} from '@/lib/clientStore'
import { addNeedsInfoTask } from '@/lib/needsInfoStore'
import { createAccountingAdapter } from '@/adapters/accounting'

const PORTAL_CLIENT_KEY = 'onfly.portal.client_id'

export function getPortalClientId(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(PORTAL_CLIENT_KEY)
  } catch {
    return null
  }
}

export function setPortalClientId(id: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PORTAL_CLIENT_KEY, id)
  } catch {
    /* ignore */
  }
}

export function getPortalClient(): ClientProfile | undefined {
  const id = getPortalClientId()
  return id ? getClient(id) : undefined
}

export function clearPortalClient(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(PORTAL_CLIENT_KEY)
  } catch {
    /* ignore */
  }
}

export type ClientOnboardResult = {
  client: ClientProfile
  taskIds: string[]
}

/** Human-filled form → create client immediately; gaps become NEEDS-INFO tasks. */
export async function submitClientOnboard(
  draft: ClientOnboardDraft,
): Promise<ClientOnboardResult> {
  const issues = validateClientOnboard(draft)
  if (issues.length) {
    throw new Error(issues.map((i) => i.message).join(' · '))
  }

  const { ops, ap, emergency, supervisors } = resolvePeople(draft)
  const rules = rulesFromOnboardDraft(draft)
  const taskIds: string[] = []

  let qbId: string | null = null
  try {
    qbId = await createAccountingAdapter().ensureCustomer(draft.legal_name.trim())
  } catch {
    qbId = null
  }

  const notesParts = [
    draft.anything_else.trim() && `Onboard notes: ${draft.anything_else.trim()}`,
    draft.po_assigned_by === 'client' && 'PO numbers assigned by client',
    draft.po_assigned_by === 'onfly' && 'PO numbers assigned by OnFly',
    draft.needs_vendor_number === true &&
      `Needs vendor # in client system${
        draft.vendor_number_notes.trim()
          ? `: ${draft.vendor_number_notes.trim()}`
          : ''
      }`,
    draft.vendor_packet_to.trim() &&
      `Vendor packet (W-9/banking) → ${draft.vendor_packet_to.trim()}`,
    `Updates: ${draft.update_channel}`,
    `Emergency: ${emergency.name} ${emergency.phone}${
      emergency.email ? ` <${emergency.email}>` : ''
    }`,
  ].filter(Boolean) as string[]

  const contacts: Array<{
    name: string
    email: string
    role: 'requester' | 'ap' | 'supply_chain'
    cell?: string
  }> = [
    {
      name: ops.name,
      email: ops.email,
      role: 'requester',
      cell: ops.phone || draft.front_desk_phone.trim(),
    },
    {
      name: ap.name,
      email: ap.email,
      role: 'ap',
      cell: ap.phone,
    },
  ]
  for (const s of supervisors) {
    if (!s.email) continue
    contacts.push({
      name: s.name || 'Supervisor',
      email: s.email,
      role: 'supply_chain',
      cell: s.phone,
    })
  }

  const lanes = draft.no_frequent_lanes
    ? []
    : draft.lanes
        .filter((l) => l.origin.trim() && l.destination.trim())
        .map((l) => ({
          origin: l.origin.trim().toUpperCase(),
          destination: l.destination.trim().toUpperCase(),
          origin_city: l.origin_city?.trim(),
          destination_city: l.destination_city?.trim(),
        }))

  const billing = draft.billing_same_as_address
    ? { ...draft.address }
    : { ...draft.billing_address }

  const poPrefix =
    draft.po_prefix.trim().toUpperCase().replace(/[^A-Z]/g, '') || null

  const client = addClient({
    name: draft.legal_name.trim(),
    email: ops.email,
    invoice_email: ap.email,
    pay_terms: payTermsLabel(draft.pay_terms),
    po_prefix: poPrefix,
    notes: notesParts.join('\n'),
    qb_customer_id: qbId,
    contacts,
    rules,
    profile: {
      source: 'portal_onboard',
      dba: draft.dba.trim() || undefined,
      website: draft.website.trim() || undefined,
      address: { ...draft.address },
      billing_address: billing,
      billing_same_as_address: draft.billing_same_as_address,
      front_desk_phone: draft.front_desk_phone.trim(),
      emergency,
      frequent_lanes: lanes,
      no_frequent_lanes: draft.no_frequent_lanes,
      requires_po: draft.po_assigned_by === 'client',
      po_assigned_by: draft.po_assigned_by,
      needs_vendor_number: draft.needs_vendor_number,
      vendor_number_notes: draft.vendor_number_notes.trim() || undefined,
      vendor_packet_to: draft.vendor_packet_to.trim() || undefined,
      update_channel: draft.update_channel,
      freight_policy: { ...draft.freight_policy },
      passenger_policy: { ...draft.passenger_policy },
      shipping_flags: {
        oversized: draft.oversized,
        high_declared_value: Boolean(draft.declared_value_norm.trim()),
        hazmat_sometimes: draft.hazmat_allowed && Boolean(draft.hazmat_notes),
      },
    },
  })

  setPortalClientId(client.id)

  taskIds.push(
    addNeedsInfoTask({
      entity_type: 'client',
      entity_id: client.id,
      entity_label: client.name,
      field: 'onboard_review',
      note: 'Public customer onboarding submitted — verify contacts, terms, routing rules, and vendor packet routing.',
      wizard: 'client',
    }).id,
  )

  if (!draft.vendor_packet_to.trim()) {
    taskIds.push(
      addNeedsInfoTask({
        entity_type: 'client',
        entity_id: client.id,
        entity_label: client.name,
        field: 'vendor_packet_to',
        note: 'No vendor-packet destination provided — confirm where to send W-9 / banking.',
        wizard: 'client',
      }).id,
    )
  }
  if (draft.needs_vendor_number === true) {
    taskIds.push(
      addNeedsInfoTask({
        entity_type: 'client',
        entity_id: client.id,
        entity_label: client.name,
        field: 'vendor_number',
        note: `Client needs OnFly as a vendor / vendor # in their system${
          draft.vendor_number_notes.trim()
            ? ` — ${draft.vendor_number_notes.trim()}`
            : ''
        }.`,
        wizard: 'client',
      }).id,
    )
  }
  if (!draft.po_assigned_by) {
    taskIds.push(
      addNeedsInfoTask({
        entity_type: 'client',
        entity_id: client.id,
        entity_label: client.name,
        field: 'po_assigned_by',
        note: 'Confirm whether PO numbers are assigned by the client or by OnFly.',
        wizard: 'client',
      }).id,
    )
  }
  if (!supervisors.length) {
    taskIds.push(
      addNeedsInfoTask({
        entity_type: 'client',
        entity_id: client.id,
        entity_label: client.name,
        field: 'supervisors',
        note: 'No supervisor emails listed — optional escalations contact missing.',
        wizard: 'client',
      }).id,
    )
  }

  return { client, taskIds }
}
