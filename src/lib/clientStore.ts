/**
 * In-session client profiles + contacts.
 * Roles drive routing:
 *  - requester → inbound email/SMS match → ring on-shift phone / request alerts
 *  - ap → invoices only
 *  - supply_chain → tracker / ETA pushes
 */

import financialsFixture from '@/fixtures/financials.json'

export type ContactRole = 'requester' | 'ap' | 'supply_chain'

export type ContactNotifyPrefs = {
  /** This email inbound → draft trip + ring on-shift dispatcher */
  request_alert: boolean
  /** Receive QuickBooks / invoice emails */
  invoice: boolean
  /** Receive tracker / ETA sheet / status pushes */
  tracker: boolean
}

export type ClientContact = {
  id: string
  name: string
  email: string
  cell: string
  role: ContactRole
  notify_prefs: ContactNotifyPrefs
}

export type ClientProfile = {
  id: string
  name: string
  /** Fallback / primary ops email */
  email: string
  /** Default invoice "To" (usually an AP contact) */
  invoice_email: string
  contacts: ClientContact[]
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

function defaultPrefs(role: ContactRole): ContactNotifyPrefs {
  if (role === 'requester') {
    return { request_alert: true, invoice: false, tracker: true }
  }
  if (role === 'ap') {
    return { request_alert: false, invoice: true, tracker: false }
  }
  return { request_alert: false, invoice: false, tracker: true }
}

function seedFromFinancials() {
  if (clients.size) return
  const names = new Set<string>()
  for (const r of financialsFixture.records) {
    const n = (r.client_name || '').trim()
    if (n) names.add(n)
  }
  for (const name of [...names].sort()) {
    const id = `client-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`
    const pay =
      financialsFixture.records.find((r) => r.client_name === name)?.pay_terms ||
      'Net 30'
    clients.set(id, {
      id,
      name,
      email: '',
      invoice_email: '',
      contacts: [],
      last_po:
        financialsFixture.records.find((r) => r.client_name === name)
          ?.operator_po ?? null,
      pay_terms: String(pay),
      notes: '',
    })
  }
  rebuild()
}

seedFromFinancials()

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
  contacts?: Array<{
    name: string
    email: string
    role?: ContactRole
    cell?: string
  }>
}): ClientProfile {
  const id = `client-${crypto.randomUUID().slice(0, 8)}`
  const email = (opts.email ?? '').trim()
  const invoice = (opts.invoice_email ?? email).trim()
  const row: ClientProfile = {
    id,
    name: opts.name.trim(),
    email,
    invoice_email: invoice,
    contacts: (opts.contacts ?? []).map((c) => {
      const role = c.role ?? 'requester'
      return {
        id: crypto.randomUUID(),
        name: c.name.trim(),
        email: c.email.trim(),
        cell: c.cell?.trim() ?? '',
        role,
        notify_prefs: defaultPrefs(role),
      }
    }),
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
  role: ContactRole = 'requester',
  cell = '',
): ClientContact | undefined {
  const row = clients.get(clientId)
  if (!row) return undefined
  const contact: ClientContact = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim(),
    cell: cell.trim(),
    role,
    notify_prefs: defaultPrefs(role),
  }
  const existing = row.contacts.find(
    (c) => c.email.toLowerCase() === contact.email.toLowerCase(),
  )
  if (existing) {
    existing.name = contact.name || existing.name
    existing.role = role
    existing.cell = cell || existing.cell
    existing.notify_prefs = { ...existing.notify_prefs, ...defaultPrefs(role) }
  } else {
    row.contacts.push(contact)
  }
  if (role === 'ap' && contact.email && !row.invoice_email) {
    row.invoice_email = contact.email
  }
  bump()
  return contact
}

export function updateClientContact(
  clientId: string,
  contactId: string,
  patch: Partial<
    Pick<ClientContact, 'name' | 'email' | 'cell' | 'role'> & {
      notify_prefs: Partial<ContactNotifyPrefs>
    }
  >,
): void {
  const row = clients.get(clientId)
  if (!row) return
  const c = row.contacts.find((x) => x.id === contactId)
  if (!c) return
  if (patch.name != null) c.name = patch.name
  if (patch.email != null) c.email = patch.email.trim()
  if (patch.cell != null) c.cell = patch.cell
  if (patch.role != null) {
    c.role = patch.role
    // Role change resets flags to that role's defaults.
    c.notify_prefs = defaultPrefs(patch.role)
  }
  if (patch.notify_prefs) {
    c.notify_prefs = { ...c.notify_prefs, ...patch.notify_prefs }
  }
  if (c.role === 'ap' && c.notify_prefs.invoice && c.email) {
    row.invoice_email = c.email
  }
  bump()
}

export function removeClientContact(clientId: string, contactId: string): void {
  const row = clients.get(clientId)
  if (!row) return
  row.contacts = row.contacts.filter((c) => c.id !== contactId)
  bump()
}

/** Emails that should ring dispatch when they send a request. */
export function listRequestAlertEmails(clientId?: string): string[] {
  const list = clientId
    ? [clients.get(clientId)].filter(Boolean)
    : [...clients.values()]
  const out: string[] = []
  for (const cl of list) {
    for (const c of cl!.contacts) {
      if (c.notify_prefs.request_alert && c.email) out.push(c.email.toLowerCase())
    }
  }
  return out
}

/** Emails flagged to receive invoices. */
export function listInvoiceEmails(clientId: string): string[] {
  const cl = clients.get(clientId)
  if (!cl) return []
  const fromContacts = cl.contacts
    .filter((c) => c.notify_prefs.invoice && c.email)
    .map((c) => c.email.toLowerCase())
  if (fromContacts.length) return [...new Set(fromContacts)]
  return cl.invoice_email ? [cl.invoice_email.toLowerCase()] : []
}

export function rememberEmailsOnClient(
  clientId: string,
  invoiceEmail: string,
  ccEmails: string[],
): void {
  const row = clients.get(clientId)
  if (!row) return
  const inv = invoiceEmail.trim()
  if (inv) {
    row.invoice_email = inv
    if (!row.contacts.some((c) => c.email.toLowerCase() === inv.toLowerCase())) {
      row.contacts.push({
        id: crypto.randomUUID(),
        name: inv.split('@')[0] ?? inv,
        email: inv,
        cell: '',
        role: 'ap',
        notify_prefs: defaultPrefs('ap'),
      })
    }
  }
  for (const raw of ccEmails) {
    const email = raw.trim()
    if (!email || !email.includes('@')) continue
    if (row.contacts.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      continue
    }
    row.contacts.push({
      id: crypto.randomUUID(),
      name: email.split('@')[0] ?? email,
      email,
      cell: '',
      role: 'supply_chain',
      notify_prefs: defaultPrefs('supply_chain'),
    })
  }
  bump()
}

export function suggestNextPo(lastPo: string | null): string {
  if (!lastPo?.trim()) return '00001'
  const s = lastPo.trim().replace(/^PO\s*#?\s*/i, '')
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
