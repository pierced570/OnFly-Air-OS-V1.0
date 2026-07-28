/**
 * Portal access grants — which emails may open which client company.
 * Desk sets these on Admin → Portal access.
 */

export type PortalAccessGrant = {
  id: string
  email: string
  client_id: string
  /** Desk label for the person (optional). */
  label: string | null
  created_at: string
}

export function normalizePortalGrantEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidPortalGrantEmail(email: string): boolean {
  const e = normalizePortalGrantEmail(email)
  return e.includes('@') && e.includes('.') && !e.includes(' ')
}

export function formatPortalGrantLine(input: {
  email: string
  clientName: string
  label?: string | null
}): string {
  const who = (input.label ?? '').trim()
  const company = input.clientName.trim() || 'Company'
  if (who) return `${input.email} → ${company} (${who})`
  return `${input.email} → ${company}`
}
