/**
 * Public customer onboarding → ClientProfile + portal session.
 */

import {
  payTermsLabel,
  resolvePeople,
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
  const taskIds: string[] = []

  let qbId: string | null = null
  try {
    qbId = await createAccountingAdapter().ensureCustomer(draft.legal_name.trim())
  } catch {
    qbId = null
  }

  const flags = {
    hazmat_sometimes: draft.hazmat_sometimes,
    temp_control: draft.temp_control,
    oversized: draft.oversized,
    high_declared_value: draft.high_declared_value,
  }

  const otherRules: string[] = []
  if (draft.requires_po) otherRules.push('PO required on invoices')
  if (draft.card_on_file === true) {
    otherRules.push('Card on file requested (send secure link)')
  }
  if (draft.card_on_file === false) otherRules.push('No card on file')
  if (flags.hazmat_sometimes) otherRules.push('Hazmat sometimes')
  if (flags.temp_control) otherRules.push('Temp control')
  if (flags.oversized) otherRules.push('Oversized freight')
  if (flags.high_declared_value) otherRules.push('High declared value')

  const notesParts = [
    draft.anything_else.trim() && `Onboard notes: ${draft.anything_else.trim()}`,
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

  const client = addClient({
    name: draft.legal_name.trim(),
    email: ops.email,
    invoice_email: ap.email,
    pay_terms: payTermsLabel(draft.pay_terms),
    notes: notesParts.join('\n'),
    qb_customer_id: qbId,
    contacts,
    rules: {
      hazmat_allowed: true,
      hazmat_notes: flags.hazmat_sometimes ? 'Sometimes — confirm per trip' : '',
      other_rules: otherRules,
    },
    profile: {
      source: 'portal_onboard',
      dba: draft.dba.trim() || undefined,
      website: draft.website.trim() || undefined,
      address: { ...draft.address },
      front_desk_phone: draft.front_desk_phone.trim(),
      emergency,
      frequent_lanes: lanes,
      no_frequent_lanes: draft.no_frequent_lanes,
      requires_po: draft.requires_po,
      card_on_file: draft.card_on_file,
      vendor_packet_to: draft.vendor_packet_to.trim() || undefined,
      update_channel: draft.update_channel,
      shipping_flags: flags,
    },
  })

  setPortalClientId(client.id)

  taskIds.push(
    addNeedsInfoTask({
      entity_type: 'client',
      entity_id: client.id,
      entity_label: client.name,
      field: 'onboard_review',
      note: 'Public customer onboarding submitted — verify contacts, terms, and vendor packet routing.',
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
  if (draft.card_on_file === true) {
    taskIds.push(
      addNeedsInfoTask({
        entity_type: 'client',
        entity_id: client.id,
        entity_label: client.name,
        field: 'card_on_file_link',
        note: 'Client requested card on file — send secure payment link (never collect card on form).',
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
