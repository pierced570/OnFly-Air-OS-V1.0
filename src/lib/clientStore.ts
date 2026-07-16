/**
 * In-session client profiles for dispatch + Quick Dispatch autofill.
 * Persists to Supabase later; empty until you add clients.
 */

export type ClientContact = {
  id: string
  name: string
  email: string
}

export type ClientProfile = {
  id: string
  name: string
  /** Primary requester / ops contact email */
  email: string
  invoice_email: string
  contacts: ClientContact[]
  /** Last PO / trip # used for this client */
  last_po: string | null
  pay_terms: string
  notes: string
}

const clients = new Map<string, ClientProfile>()
const listeners = new Set<() => void>()
let snapshot: ClientProfile[] = []

function rebuild() {
  snapshot = [...clients.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeClients(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listClients(): ClientProfile[] {
  return snapshot
}

export function getClient(id: string): ClientProfile | undefined {
  return clients.get(id)
}

export function addClient(opts: {
  name: string
  email?: string
  invoice_email?: string
  pay_terms?: string
  contacts?: Array<{ name: string; email: string }>
}): ClientProfile {
  const id = `client-${crypto.randomUUID().slice(0, 8)}`
  const email = (opts.email ?? '').trim()
  const invoice = (opts.invoice_email ?? email).trim()
  const row: ClientProfile = {
    id,
    name: opts.name.trim(),
    email,
    invoice_email: invoice,
    contacts: (opts.contacts ?? []).map((c) => ({
      id: crypto.randomUUID(),
      name: c.name.trim(),
      email: c.email.trim(),
    })),
    last_po: null,
    pay_terms: opts.pay_terms?.trim() || 'Net 30',
    notes: '',
  }
  clients.set(id, row)
  bump()
  return row
}

export function updateClient(
  id: string,
  patch: Partial<
    Pick<
      ClientProfile,
      'name' | 'email' | 'invoice_email' | 'pay_terms' | 'notes' | 'last_po'
    >
  >,
): ClientProfile | undefined {
  const row = clients.get(id)
  if (!row) return undefined
  Object.assign(row, patch)
  bump()
  return row
}

export function addClientContact(
  clientId: string,
  name: string,
  email: string,
): ClientContact | undefined {
  const row = clients.get(clientId)
  if (!row) return undefined
  const contact: ClientContact = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim(),
  }
  if (!row.contacts.some((c) => c.email.toLowerCase() === contact.email.toLowerCase())) {
    row.contacts.push(contact)
    bump()
  }
  return contact
}

/** Ensure emails used on dispatch are saved on the client profile. */
export function rememberEmailsOnClient(
  clientId: string,
  invoiceEmail: string,
  ccEmails: string[],
): void {
  const row = clients.get(clientId)
  if (!row) return
  const inv = invoiceEmail.trim()
  if (inv) row.invoice_email = inv
  for (const raw of ccEmails) {
    const email = raw.trim()
    if (!email || !email.includes('@')) continue
    if (row.contacts.some((c) => c.email.toLowerCase() === email.toLowerCase())) continue
    if (row.invoice_email.toLowerCase() === email.toLowerCase()) continue
    row.contacts.push({
      id: crypto.randomUUID(),
      name: email.split('@')[0] ?? email,
      email,
    })
  }
  bump()
}

/**
 * Suggest next PO from last used.
 * Numeric → +1 zero-padded. Trailing digits → bump. Else → "-2" suffix.
 */
export function suggestNextPo(lastPo: string | null): string {
  if (!lastPo?.trim()) return '00001'
  const s = lastPo.trim()
  if (/^\d+$/.test(s)) {
    const n = Number(s) + 1
    return String(n).padStart(Math.max(s.length, 5), '0')
  }
  const m = s.match(/^(.*?)(\d+)$/)
  if (m) {
    const prefix = m[1]!
    const digits = m[2]!
    const n = Number(digits) + 1
    return `${prefix}${String(n).padStart(digits.length, '0')}`
  }
  return `${s}-2`
}

export function recordPoUsed(clientId: string, po: string): void {
  const row = clients.get(clientId)
  if (!row) return
  row.last_po = po.trim()
  bump()
}
