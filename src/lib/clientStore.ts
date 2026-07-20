/**
 * In-session client profiles + contacts.
 * Roles drive routing:
 *  - requester → inbound email/SMS match → ring on-shift phone / request alerts
 *  - ap → invoices only
 *  - supply_chain → tracker / ETA pushes
 *
 * Supabase hydrate is preferred. When DB is empty / offline, we lazily seed
 * unique client names from financials.json (dynamic import — not on Board boot).
 */

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

export type ClientRules = {
  dual_pilot_required: boolean
  freight_only: boolean
  multi_engine_only: boolean
  no_single_engine_night: boolean
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  other_rules: string[]
}

export const DEFAULT_CLIENT_RULES: ClientRules = {
  dual_pilot_required: false,
  freight_only: false,
  multi_engine_only: false,
  no_single_engine_night: false,
  hazmat_allowed: true,
  hazmat_notes: '',
  declared_value_norm: '',
  other_rules: [],
}

/** Extended profile from public customer onboarding (also in clients.profile jsonb). */
export type ClientExtendedProfile = {
  dba?: string
  website?: string
  address?: {
    street: string
    city: string
    state: string
    zip: string
  }
  billing_address?: {
    street: string
    city: string
    state: string
    zip: string
  }
  billing_same_as_address?: boolean
  front_desk_phone?: string
  emergency?: { name: string; email: string; phone: string }
  frequent_lanes?: Array<{
    origin: string
    destination: string
    origin_city?: string
    destination_city?: string
  }>
  no_frequent_lanes?: boolean
  requires_po?: boolean
  card_on_file?: boolean | null
  vendor_packet_to?: string
  update_channel?: 'email' | 'sms' | 'both'
  shipping_flags?: {
    hazmat_sometimes?: boolean
    temp_control?: boolean
    oversized?: boolean
    high_declared_value?: boolean
  }
  source?: 'portal_onboard' | 'admin' | 'import'
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
  /** Client-specific PO prefix (e.g. PSA, EDW) for DocNumber sequencing */
  po_prefix: string | null
  pay_terms: string
  notes: string
  rules: ClientRules
  qb_customer_id: string | null
  profile: ClientExtendedProfile
}

const clients = new Map<string, ClientProfile>()
const listeners = new Set<() => void>()
let snapshot: ClientProfile[] = []

function rebuild() {
  snapshot = [...clients.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function bump(persistId?: string) {
  rebuild()
  for (const l of listeners) l()
  if (persistId) {
    const row = clients.get(persistId)
    if (row) void import('@/lib/db/persist').then((m) => m.persistClient(row))
  }
}

/** Replace in-memory directory with Supabase rows (no-op if empty — keeps fixture seed). */
export function replaceClientsFromDb(rows: ClientProfile[]): void {
  if (!rows.length) return
  clients.clear()
  for (const r of rows) clients.set(r.id, r)
  fixtureSeedDone = true
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

const FIXTURE_SKIP = new Set([
  'po enter in error',
  'enter in error',
  'unknown',
  'n/a',
  'na',
])

let fixtureSeedDone = false
let fixtureSeedPromise: Promise<number> | null = null

type FinancialsFixture = {
  records: Array<{
    client_name?: string | null
    pay_terms?: string | null
    operator_po?: string | null
  }>
}

/**
 * Lazy-load financials.json and seed unique clients when the directory is empty.
 * Safe to call repeatedly; no-ops after DB hydrate or a successful seed.
 */
export async function ensureClientsSeeded(): Promise<number> {
  if (clients.size > 0 || fixtureSeedDone) return clients.size
  if (fixtureSeedPromise) return fixtureSeedPromise
  fixtureSeedPromise = (async () => {
    try {
      const mod = await import('@/fixtures/financials.json')
      const fixture = (mod.default ?? mod) as FinancialsFixture
      if (clients.size > 0) {
        fixtureSeedDone = true
        return clients.size
      }
      const byName = new Map<
        string,
        { pay_terms: string; last_po: string | null }
      >()
      for (const r of fixture.records ?? []) {
        const name = (r.client_name || '').trim()
        if (!name) continue
        if (FIXTURE_SKIP.has(name.toLowerCase())) continue
        if (!byName.has(name)) {
          byName.set(name, {
            pay_terms: String(r.pay_terms || 'Net 30'),
            last_po: r.operator_po ? String(r.operator_po) : null,
          })
        }
      }
      for (const name of [...byName.keys()].sort()) {
        const meta = byName.get(name)!
        const id = `client-${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 24)}`
        if (clients.has(id)) continue
        clients.set(id, {
          id,
          name,
          email: '',
          invoice_email: '',
          contacts: [],
          last_po: meta.last_po,
          po_prefix: guessPoPrefix(meta.last_po),
          pay_terms: meta.pay_terms,
          notes: '',
          rules: { ...DEFAULT_CLIENT_RULES },
          qb_customer_id: null,
          profile: { source: 'import' },
        })
      }
      fixtureSeedDone = true
      rebuild()
      for (const l of listeners) l()
      return clients.size
    } catch (e) {
      console.warn('[clients] fixture seed failed', e)
      fixtureSeedDone = true
      return clients.size
    } finally {
      fixtureSeedPromise = null
    }
  })()
  return fixtureSeedPromise
}

/** Kick off fixture seed after first paint when nothing is in memory yet. */
export function scheduleClientsFixtureSeed(): void {
  if (typeof window === 'undefined') return
  // Vitest / node — hydrate or explicit ensureClientsSeeded only
  if (import.meta.env?.MODE === 'test' || import.meta.env?.VITEST) return
  const run = () => {
    void ensureClientsSeeded()
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 3000 })
  } else {
    setTimeout(run, 100)
  }
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
  po_prefix?: string | null
  notes?: string
  rules?: Partial<ClientRules>
  qb_customer_id?: string | null
  profile?: ClientExtendedProfile
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
    po_prefix: opts.po_prefix?.trim().toUpperCase() || null,
    pay_terms: opts.pay_terms?.trim() || 'Net 30',
    notes: opts.notes?.trim() ?? '',
    rules: {
      ...DEFAULT_CLIENT_RULES,
      ...opts.rules,
      other_rules: opts.rules?.other_rules ?? DEFAULT_CLIENT_RULES.other_rules,
    },
    qb_customer_id: opts.qb_customer_id ?? null,
    profile: { ...(opts.profile ?? {}) },
  }
  clients.set(id, row)
  bump(id)
  return row
}

export function updateClient(
  id: string,
  patch: Partial<
    Pick<
      ClientProfile,
      | 'name'
      | 'email'
      | 'invoice_email'
      | 'pay_terms'
      | 'notes'
      | 'last_po'
      | 'po_prefix'
      | 'qb_customer_id'
      | 'profile'
    > & { rules: Partial<ClientRules> }
  >,
): ClientProfile | undefined {
  const row = clients.get(id)
  if (!row) return undefined
  const { rules, profile, ...rest } = patch
  Object.assign(row, rest)
  if (rules) row.rules = { ...row.rules, ...rules }
  if (profile) row.profile = { ...row.profile, ...profile }
  if (!row.profile) row.profile = {}
  bump(id)
  return row
}

/** Chips for quote screens. */
export function clientRuleChips(clientId: string): string[] {
  const c = clients.get(clientId)
  if (!c) return []
  const chips: string[] = []
  if (c.rules.dual_pilot_required) chips.push('Dual pilot required')
  if (c.rules.freight_only) chips.push('Freight only')
  if (c.rules.multi_engine_only) chips.push('Multi-engine only')
  if (c.rules.no_single_engine_night) chips.push('No SE night')
  if (!c.rules.hazmat_allowed) chips.push('No hazmat')
  else if (c.rules.hazmat_notes) chips.push(`Hazmat: ${c.rules.hazmat_notes}`)
  if (c.rules.declared_value_norm)
    chips.push(`Declared value: ${c.rules.declared_value_norm}`)
  chips.push(...c.rules.other_rules)
  return chips
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
  bump(clientId)
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
  bump(clientId)
}

export function removeClientContact(clientId: string, contactId: string): void {
  const row = clients.get(clientId)
  if (!row) return
  row.contacts = row.contacts.filter((c) => c.id !== contactId)
  bump(clientId)
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

/**
 * Emails that get ETA sheets + portal trackers (supply chain / tracker flag).
 * Never includes AP-only contacts unless they also have tracker on.
 */
export function listTrackerEmails(clientId: string): string[] {
  const cl = clients.get(clientId)
  if (!cl) return []
  const out = cl.contacts
    .filter(
      (c) =>
        c.email &&
        (c.notify_prefs.tracker || c.role === 'supply_chain'),
    )
    .map((c) => c.email.toLowerCase())
  return [...new Set(out)]
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
  bump(clientId)
}

export function guessPoPrefix(lastPo: string | null | undefined): string | null {
  if (!lastPo?.trim()) return null
  const s = lastPo.trim().replace(/^PO\s*#?\s*/i, '')
  const m = s.match(/^([A-Za-z]+)/)
  return m?.[1]?.toUpperCase() ?? null
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
  bump(clientId)
}
