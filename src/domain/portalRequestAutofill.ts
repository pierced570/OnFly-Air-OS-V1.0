/**
 * Portal trip request — when the requester email matches a known company,
 * autofill company name, client id, and best urgent phone from directory.
 * Pure TS.
 */

import { resolveClientIdByPortalEmail } from '@/domain/portalDomains'

export type PortalAutofillClient = {
  id: string
  name: string
  email?: string | null
  invoice_email?: string | null
  contacts?: Array<{
    email?: string | null
    cell?: string | null
    name?: string | null
    role?: string | null
  }>
  profile?: {
    allowed_email_domains?: string[] | null
    website?: string | null
    front_desk_phone?: string | null
    ops_callback_phone?: string | null
    bases?: Array<{
      emails?: string[]
      supervisor_emails?: string[]
      stores_emails?: string[]
    }> | null
  }
}

export type PortalRequestAutofill = {
  client_id: string
  client_name: string
  urgent_phone: string
  /** True when we matched an exact contact email (vs domain-only). */
  exactContact: boolean
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function looksLikeEmail(raw: string): boolean {
  const e = normalizeEmail(raw)
  const at = e.indexOf('@')
  if (at < 1) return false
  const domain = e.slice(at + 1)
  return domain.includes('.') && !e.includes(' ')
}

/**
 * Prefer the matched contact cell; otherwise company desk / ops phones.
 * Do not steal another contact's cell on domain-only matches.
 */
export function urgentPhoneFromClient(
  client: PortalAutofillClient,
  email: string,
): string {
  const needle = normalizeEmail(email)
  const contacts = client.contacts ?? []
  const exact = contacts.find(
    (c) => (c.email ?? '').trim().toLowerCase() === needle,
  )
  const cell = (exact?.cell ?? '').trim()
  if (cell) return cell

  const desk = (client.profile?.front_desk_phone ?? '').trim()
  if (desk) return desk
  const ops = (client.profile?.ops_callback_phone ?? '').trim()
  if (ops) return ops
  return ''
}

/**
 * Resolve company autofill for a portal email, or null if unknown / incomplete.
 */
export function portalRequestAutofillFromEmail(
  emailRaw: string,
  clients: PortalAutofillClient[],
): PortalRequestAutofill | null {
  if (!looksLikeEmail(emailRaw)) return null
  const email = normalizeEmail(emailRaw)
  const id = resolveClientIdByPortalEmail(email, clients)
  if (!id) return null
  const client = clients.find((c) => c.id === id)
  if (!client) return null

  const exactContact =
    (client.contacts ?? []).some(
      (c) => (c.email ?? '').trim().toLowerCase() === email,
    ) ||
    (client.email ?? '').trim().toLowerCase() === email ||
    (client.invoice_email ?? '').trim().toLowerCase() === email

  return {
    client_id: client.id,
    client_name: (client.name ?? '').trim(),
    urgent_phone: urgentPhoneFromClient(client, email),
    exactContact,
  }
}
