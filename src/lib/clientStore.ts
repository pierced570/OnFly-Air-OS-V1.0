/**
 * In-session client profiles + contacts.
 * Roles drive routing:
 *  - requester → inbound email/SMS match → ring on-shift phone / request alerts
 *  - ap → invoices only
 *  - supply_chain → tracker / ETA pushes
 *
 * Boots from localStorage (if any), then Supabase hydrate. When both are empty,
 * seeds directory names from financials.json (lazy) so Financials clients appear here.
 */

import {
  listBaseGeneratedEmails,
  type ClientBaseRef,
} from '@/domain/clientBaseEmails'
import { hardFiltersFromPolicy, normalizeMissionPolicy } from '@/domain/clientOnboard'
import { ONFLY_INFO_BCC } from '@/domain/onflyEmails'
import { withEnsuredPortalDomains } from '@/domain/portalDomains'
import type { ClientRules as RoutingClientRules } from '@/domain/routing'

export type ContactRole = 'requester' | 'ap' | 'supply_chain'

/** Person vs distribution list — directory badge only; role+prefs still drive sends. */
export type ContactKind = 'person' | 'dl'

export type ContactNotifyPrefs = {
  /** This email inbound → draft trip + ring on-shift dispatcher */
  request_alert: boolean
  /** Receive QuickBooks / invoice emails (AP flag) */
  invoice: boolean
  /** Always include on ETA / tracker when true */
  tracker: boolean
}

export type ClientContact = {
  id: string
  name: string
  email: string
  cell: string
  role: ContactRole
  kind: ContactKind
  /** Job title / desk label (e.g. MX Supervisor, AOG Desk). */
  title?: string
  /**
   * Airport ICAOs — when a trip uses these airports, this email autopopulates
   * on the ETA sheet (in addition to global tracker flag).
   */
  eta_icaos?: string[]
  notify_prefs: ContactNotifyPrefs
}

export type ClientRules = {
  dual_pilot_required: boolean
  freight_only: boolean
  multi_engine_only: boolean
  /** Single-engine allowed only when turboprop (Chunk 6 interview). */
  single_engine_turboprop_only: boolean
  no_single_engine_night: boolean
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  /**
   * When true, aircraft restrictions soft-block (booking gated) instead of
   * hard-failing candidates — dispatch can override with client sign-off.
   */
  exceptions_with_permission: boolean
  other_rules: string[]
}

export const DEFAULT_CLIENT_RULES: ClientRules = {
  dual_pilot_required: false,
  freight_only: false,
  multi_engine_only: false,
  single_engine_turboprop_only: false,
  no_single_engine_night: false,
  hazmat_allowed: true,
  hazmat_notes: '',
  declared_value_norm: '',
  exceptions_with_permission: false,
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
  /** Desk / inbound line (“call us”). */
  front_desk_phone?: string
  /** Client callback / outbound line (“call them”). */
  ops_callback_phone?: string
  emergency?: { name: string; email: string; phone: string }
  frequent_lanes?: Array<{
    origin: string
    destination: string
    origin_city?: string
    destination_city?: string
  }>
  no_frequent_lanes?: boolean
  /**
   * Company bases (airport ICAOs) that receive ETA / tracking.
   * Empty emails → auto `{base}@companyDomain` (see clientBaseEmails).
   */
  bases?: ClientBaseRef[]
  /**
   * Corporate email domains that may sign into this client's portal
   * (e.g. ["acme.com"]). Anyone with XYZ@acme.com links via link_portal_user.
   * Public mailboxes (gmail, etc.) are never valid entries.
   */
  allowed_email_domains?: string[]
  requires_po?: boolean
  /** client = they provide PO; onfly = we generate */
  po_assigned_by?: 'client' | 'onfly' | null
  needs_vendor_number?: boolean | null
  vendor_number_notes?: string
  /** Saved OnFly vendor # with this client (optional invoice field). */
  vendor_number?: string | null
  /** Trip label (code or T-ref) when last_po was recorded. */
  last_po_trip_ref?: string | null
  vendor_packet_to?: string
  update_channel?: 'email' | 'sms' | 'both'
  /** Freight vs passenger aircraft restrictions from /client setup. */
  freight_policy?: {
    no_single_engine: boolean
    no_single_engine_pistons: boolean
    dual_pilot_required: boolean
    other_restriction: boolean
    other_notes: string
  }
  passenger_policy?: {
    no_single_engine: boolean
    no_single_engine_pistons: boolean
    dual_pilot_required: boolean
    other_restriction: boolean
    other_notes: string
  }
  shipping_flags?: {
    hazmat_sometimes?: boolean
    temp_control?: boolean
    oversized?: boolean
    high_declared_value?: boolean
  }
  /** @deprecated Prefer needs_vendor_number / PO fields — kept for legacy UI rows. */
  card_on_file?: boolean | null
  source?: 'portal_onboard' | 'admin' | 'import'
}

export type ClientProfile = {
  id: string
  /**
   * Supabase `clients.id` when `id` is a legacy_key (e.g. client-xxxxxxxx).
   * Trip hydrate stores the UUID on trips.client_id — getClient must resolve both.
   */
  supabase_id?: string | null
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

const STORAGE_KEY = 'onfly.clients.v1'

const clients = new Map<string, ClientProfile>()
/** Supabase UUID → directory primary id (legacy_key or uuid). */
const clientIdAliases = new Map<string, string>()
const listeners = new Set<() => void>()
let snapshot: ClientProfile[] = []

function rebuild() {
  snapshot = [...clients.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function persistLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...clients.values()]))
  } catch {
    /* quota / private mode */
  }
}

function loadLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as ClientProfile[]
    if (!Array.isArray(parsed) || !parsed.length) return
    for (const row of parsed) {
      if (!row?.id || !row.name) continue
      row.rules = { ...DEFAULT_CLIENT_RULES, ...(row.rules ?? {}) }
      if (!row.profile) row.profile = {}
      if (!Array.isArray(row.contacts)) row.contacts = []
      for (const c of row.contacts) {
        if (!c.kind) c.kind = 'person'
        if (!c.notify_prefs) {
          c.notify_prefs = { request_alert: false, invoice: false, tracker: false }
        }
      }
      clients.set(row.id, row)
      if (row.supabase_id && row.supabase_id !== row.id) {
        clientIdAliases.set(row.supabase_id, row.id)
      }
    }
  } catch {
    /* ignore */
  }
}

function bump(persistId?: string) {
  rebuild()
  persistLocal()
  for (const l of listeners) l()
  if (persistId) {
    const row = clients.get(persistId)
    if (row) void import('@/lib/db/persist').then((m) => m.persistClient(row))
  }
}

loadLocal()
rebuild()

/** Replace in-memory directory with Supabase rows. */
export function replaceClientsFromDb(rows: ClientProfile[]): void {
  if (!rows.length) return
  // Preserve last_po when DB is null but this session already recorded one
  // (persist race / incomplete row) — trips + financials still backfill via
  // resolveClientLastPo, but keep directory continuity across hydrate.
  const priorPo = new Map<
    string,
    { last_po: string | null; last_po_trip_ref?: string | null }
  >()
  for (const c of clients.values()) {
    if (!c.last_po?.trim()) continue
    priorPo.set(c.id, {
      last_po: c.last_po,
      last_po_trip_ref: c.profile?.last_po_trip_ref ?? null,
    })
    if (c.supabase_id) {
      priorPo.set(c.supabase_id, {
        last_po: c.last_po,
        last_po_trip_ref: c.profile?.last_po_trip_ref ?? null,
      })
    }
  }

  clients.clear()
  clientIdAliases.clear()
  for (const r of rows) {
    const keep =
      (!r.last_po?.trim() &&
        (priorPo.get(r.id) ||
          (r.supabase_id ? priorPo.get(r.supabase_id) : undefined))) ||
      null
    if (keep?.last_po) {
      r.last_po = keep.last_po
      if (keep.last_po_trip_ref && !r.profile?.last_po_trip_ref) {
        r.profile = {
          ...(r.profile ?? {}),
          last_po_trip_ref: keep.last_po_trip_ref,
        }
      }
    }
    clients.set(r.id, r)
    if (r.supabase_id && r.supabase_id !== r.id) {
      clientIdAliases.set(r.supabase_id, r.id)
    }
  }
  rebuild()
  persistLocal()
  for (const l of listeners) l()
}

/**
 * Ensure financials ledger client names appear in the directory.
 * Merges missing names (does not wipe session/DB clients like "Tester").
 * Skips names that soft-match an existing directory row (export hydrate).
 */
export async function ensureClientsDirectorySeeded(): Promise<number> {
  const { clientDirectoryNamesMatch } = await import(
    '@/domain/clientExportImport'
  )
  const fixture = (await import('@/fixtures/financials.json')).default as {
    records: Array<{ client_name?: string; pay_terms?: string | null }>
  }
  const skip = new Set(['', 'po enter in error'])
  const byName = new Map<string, { pay_terms: string }>()
  for (const r of fixture.records ?? []) {
    const name = (r.client_name ?? '').trim()
    if (!name || skip.has(name.toLowerCase())) continue
    const pay = (r.pay_terms ?? '').trim() || 'Net 30'
    if (!byName.has(name)) byName.set(name, { pay_terms: pay })
  }

  const existing = [...clients.values()]
  let added = 0
  let touched = 0
  for (const [name, meta] of [...byName.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const hit = existing.find((c) => clientDirectoryNamesMatch(c.name, name))
    if (hit) {
      // Prefer longer canonical names (PSA → PSA Airlines) and portal domains.
      if (name.length > hit.name.length) {
        hit.name = name
        touched++
      }
      const ensured = withEnsuredPortalDomains(hit)
      const nextDomains = ensured.profile?.allowed_email_domains ?? []
      const prev = hit.profile.allowed_email_domains ?? []
      const same =
        nextDomains.length === prev.length &&
        nextDomains.every((d, i) => d === prev[i])
      if (!same || ensured.profile?.website !== hit.profile.website) {
        hit.profile = {
          ...hit.profile,
          allowed_email_domains: nextDomains.length ? nextDomains : undefined,
          website: ensured.profile?.website ?? hit.profile.website,
        }
        touched++
      }
      continue
    }
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
    const id = `fin-${slug || crypto.randomUUID().slice(0, 8)}`
    if (clients.has(id)) continue
    const stub: ClientProfile = {
      id,
      name,
      email: '',
      invoice_email: '',
      contacts: [],
      last_po: null,
      po_prefix: null,
      pay_terms: meta.pay_terms,
      notes:
        'Seeded from financials ledger — complete profile via /client or edit here.',
      rules: { ...DEFAULT_CLIENT_RULES },
      qb_customer_id: null,
      profile: { source: 'import' },
    }
    const ensured = withEnsuredPortalDomains({
      id: stub.id,
      name: stub.name,
      email: stub.email,
      invoice_email: stub.invoice_email,
      contacts: stub.contacts,
      profile: {
        allowed_email_domains: stub.profile.allowed_email_domains,
        website: stub.profile.website,
        bases: stub.profile.bases,
      },
    })
    stub.profile = {
      ...stub.profile,
      allowed_email_domains: ensured.profile?.allowed_email_domains,
      website: ensured.profile?.website ?? stub.profile.website,
    }
    clients.set(id, stub)
    existing.push(clients.get(id)!)
    added++
  }
  if (added || touched) {
    rebuild()
    persistLocal()
    for (const l of listeners) l()
  }
  return added
}

/** Test-only: wipe in-memory + localStorage directory. */
export function __resetClientsForTests(): void {
  clients.clear()
  clientIdAliases.clear()
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
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
  const direct = clients.get(id)
  if (direct) return direct
  const aliased = clientIdAliases.get(id)
  return aliased ? clients.get(aliased) : undefined
}

/**
 * True when two ids refer to the same directory client (legacy_key ↔ supabase UUID).
 */
export function sameClientId(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const ca = getClient(a)
  const cb = getClient(b)
  if (!ca || !cb) return false
  return ca.id === cb.id
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
    kind?: ContactKind
    title?: string
    eta_icaos?: string[]
    notify_prefs?: Partial<ContactNotifyPrefs>
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
        kind: c.kind ?? 'person',
        title: c.title?.trim() || undefined,
        eta_icaos: c.eta_icaos?.length ? [...c.eta_icaos] : undefined,
        notify_prefs: c.notify_prefs
          ? { ...defaultPrefs(role), ...c.notify_prefs }
          : defaultPrefs(role),
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
  const ensured = withEnsuredPortalDomains(row)
  row.profile = {
    ...row.profile,
    allowed_email_domains: ensured.profile?.allowed_email_domains,
    website: ensured.profile?.website ?? row.profile.website,
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

/**
 * Full replace of contacts + profile fields from a clients-export draft.
 * Used to overwrite blank financials stubs with the CSV directory.
 */
export function applyClientExportProfile(
  id: string,
  next: {
    name?: string
    email?: string
    invoice_email?: string
    pay_terms?: string
    po_prefix?: string | null
    notes?: string
    rules?: ClientRules
    profile?: ClientExtendedProfile
    contacts: ClientContact[]
  },
): ClientProfile | undefined {
  const row = clients.get(id)
  if (!row) return undefined
  if (next.name != null && next.name.trim()) row.name = next.name.trim()
  if (next.email != null) row.email = next.email
  if (next.invoice_email != null) row.invoice_email = next.invoice_email
  if (next.pay_terms != null) row.pay_terms = next.pay_terms
  if (next.po_prefix !== undefined) row.po_prefix = next.po_prefix
  if (next.notes != null) row.notes = next.notes
  if (next.rules) row.rules = { ...DEFAULT_CLIENT_RULES, ...next.rules }
  if (next.profile) row.profile = { ...row.profile, ...next.profile }
  row.contacts = next.contacts.map((c) => ({
    ...c,
    id: c.id || crypto.randomUUID(),
    kind: c.kind ?? 'person',
    notify_prefs: c.notify_prefs ?? defaultPrefs(c.role),
  }))
  // Portal domain allowlist: on-file emails + manual + known-client rules (PSA).
  const ensured = withEnsuredPortalDomains(row)
  row.profile = {
    ...row.profile,
    allowed_email_domains: ensured.profile?.allowed_email_domains,
    website: ensured.profile?.website ?? row.profile.website,
  }
  bump(id)
  return row
}

/** Refresh portal allowlists from emails on file + known-client rules (e.g. PSA). */
export function ensureAllClientPortalDomains(): number {
  let n = 0
  for (const row of clients.values()) {
    const ensured = withEnsuredPortalDomains(row)
    const nextDomains = ensured.profile?.allowed_email_domains ?? []
    const prev = row.profile.allowed_email_domains ?? []
    const same =
      nextDomains.length === prev.length &&
      nextDomains.every((d, i) => d === prev[i])
    const nextWebsite = ensured.profile?.website
    if (same && nextWebsite === row.profile.website) continue
    row.profile = {
      ...row.profile,
      allowed_email_domains: nextDomains.length ? nextDomains : undefined,
      website: nextWebsite ?? row.profile.website,
    }
    bump(row.id)
    n++
  }
  return n
}

/** Remove a directory row (used to scrub duplicate financials stubs after export hydrate). */
export function removeClient(id: string): boolean {
  const row = clients.get(id)
  if (!row) return false
  if (row.supabase_id) clientIdAliases.delete(row.supabase_id)
  clients.delete(id)
  rebuild()
  persistLocal()
  for (const l of listeners) l()
  return true
}

/**
 * Routing hard filters for a trip's payload kind.
 * Cargo (and freight-only clients) use stored `rules` (freight column).
 * Passenger trips overlay `profile.passenger_policy`.
 * Both → stricter merge of freight rules + passenger policy.
 */
export function clientRulesForRouting(
  client: ClientProfile | undefined,
  payloadKind: 'cargo' | 'pax' | 'both',
): RoutingClientRules {
  if (!client) return {}
  const base: RoutingClientRules = {
    dual_pilot_required: client.rules.dual_pilot_required,
    freight_only: client.rules.freight_only,
    multi_engine_only: client.rules.multi_engine_only,
    single_engine_turboprop_only: client.rules.single_engine_turboprop_only,
    no_single_engine_night: client.rules.no_single_engine_night,
    hazmat_allowed: client.rules.hazmat_allowed,
    exceptions_with_permission: client.rules.exceptions_with_permission,
  }
  if (payloadKind === 'cargo') return base

  const paxPol = client.profile.passenger_policy
  if (!paxPol) return base
  const hard = hardFiltersFromPolicy(normalizeMissionPolicy(paxPol))

  if (payloadKind === 'pax') {
    return {
      ...base,
      dual_pilot_required: hard.dual_pilot_required,
      multi_engine_only: hard.multi_engine_only,
      single_engine_turboprop_only: hard.single_engine_turboprop_only,
    }
  }

  const multi = Boolean(base.multi_engine_only || hard.multi_engine_only)
  return {
    ...base,
    dual_pilot_required: Boolean(
      base.dual_pilot_required || hard.dual_pilot_required,
    ),
    multi_engine_only: multi,
    single_engine_turboprop_only: multi
      ? false
      : Boolean(
          base.single_engine_turboprop_only || hard.single_engine_turboprop_only,
        ),
  }
}

/** Chips for quote screens. */
export function clientRuleChips(clientId: string): string[] {
  const c = clients.get(clientId)
  if (!c) return []
  const chips: string[] = []
  if (c.rules.dual_pilot_required) chips.push('Dual pilot required')
  if (c.rules.freight_only) chips.push('Freight only')
  if (c.rules.multi_engine_only) chips.push('No single-engine')
  if (c.rules.single_engine_turboprop_only)
    chips.push('No single-engine pistons (SE turboprop OK)')
  if (c.rules.no_single_engine_night) chips.push('No SE night')
  if (c.rules.exceptions_with_permission)
    chips.push('Exceptions OK with confirmation')
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
  extra?: {
    kind?: ContactKind
    title?: string
    eta_icaos?: string[]
    notify_prefs?: Partial<ContactNotifyPrefs>
  },
): ClientContact | undefined {
  const row = clients.get(clientId)
  if (!row) return undefined
  const contact: ClientContact = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim(),
    cell: cell.trim(),
    role,
    kind: extra?.kind ?? 'person',
    title: extra?.title?.trim() || undefined,
    eta_icaos: extra?.eta_icaos?.length
      ? [...extra.eta_icaos.map((x) => x.trim().toUpperCase()).filter(Boolean)]
      : undefined,
    notify_prefs: {
      ...defaultPrefs(role),
      ...(extra?.notify_prefs ?? {}),
    },
  }
  const existing = row.contacts.find(
    (c) => c.email.toLowerCase() === contact.email.toLowerCase(),
  )
  if (existing) {
    existing.name = contact.name || existing.name
    existing.role = role
    existing.cell = cell || existing.cell
    existing.kind = contact.kind
    if (contact.title) existing.title = contact.title
    if (contact.eta_icaos?.length) {
      const set = new Set([
        ...(existing.eta_icaos ?? []),
        ...contact.eta_icaos,
      ])
      existing.eta_icaos = [...set]
    }
    existing.notify_prefs = {
      ...existing.notify_prefs,
      ...defaultPrefs(role),
      ...(extra?.notify_prefs ?? {}),
    }
  } else {
    row.contacts.push(contact)
  }
  if (
    (role === 'ap' || contact.notify_prefs.invoice) &&
    contact.email &&
    !row.invoice_email
  ) {
    row.invoice_email = contact.email
  }
  bump(clientId)
  return contact
}

export function updateClientContact(
  clientId: string,
  contactId: string,
  patch: Partial<
    Pick<
      ClientContact,
      'name' | 'email' | 'cell' | 'role' | 'kind' | 'title' | 'eta_icaos'
    > & {
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
  if (patch.kind != null) c.kind = patch.kind
  if (patch.title != null) c.title = patch.title.trim() || undefined
  if (patch.eta_icaos != null) {
    c.eta_icaos = patch.eta_icaos
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
    if (!c.eta_icaos.length) c.eta_icaos = undefined
  }
  if (patch.role != null) {
    c.role = patch.role
    // Role change resets flags to that role's defaults.
    c.notify_prefs = defaultPrefs(patch.role)
  }
  if (patch.notify_prefs) {
    c.notify_prefs = { ...c.notify_prefs, ...patch.notify_prefs }
  }
  if (c.notify_prefs.invoice && c.email) {
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

function icaoCodesMatch(a: string, b: string): boolean {
  const x = a.trim().toUpperCase()
  const y = b.trim().toUpperCase()
  if (!x || !y) return false
  if (x === y) return true
  const sx = x.length === 4 && x.startsWith('K') ? x.slice(1) : x
  const sy = y.length === 4 && y.startsWith('K') ? y.slice(1) : y
  return sx === sy
}

/**
 * Contacts flagged for ETA when the trip uses specific airports
 * (`eta_icaos`), regardless of the global tracker toggle.
 */
export function listAirportEtaEmails(
  clientId: string,
  legIcaos: string[],
): string[] {
  const cl = getClient(clientId)
  if (!cl || !legIcaos.length) return []
  const out: string[] = []
  for (const c of cl.contacts) {
    if (!c.email || !c.eta_icaos?.length) continue
    const hit = c.eta_icaos.some((code) =>
      legIcaos.some((leg) => icaoCodesMatch(code, leg)),
    )
    if (hit) out.push(c.email.toLowerCase())
  }
  return [...new Set(out)]
}

/**
 * ETA / tracking recipients: tracker contacts + airport-flagged contacts +
 * base mailboxes (stored or auto-generated).
 * When legIcaos are provided, prefer bases / eta_icaos that match the trip.
 */
export function listEtaTrackingEmails(
  clientId: string,
  opts?: { legIcaos?: string[] },
): string[] {
  const cl = getClient(clientId)
  if (!cl) return []
  const legs = opts?.legIcaos ?? []
  const fromContacts = listTrackerEmails(clientId)
  const fromAirportFlags = listAirportEtaEmails(clientId, legs)
  const fromBases = listBaseGeneratedEmails(
    {
      email: cl.email,
      invoice_email: cl.invoice_email,
      website: cl.profile.website,
      contactEmails: cl.contacts.map((c) => c.email),
      bases: cl.profile.bases,
      frequent_lanes: cl.profile.frequent_lanes,
    },
    { legIcaos: legs },
  ).map((b) => b.email.toLowerCase())
  return [...new Set([...fromContacts, ...fromAirportFlags, ...fromBases])]
}

/** Saved contacts that are ETA/tracker (not AP-only), plus airport-flagged. */
export function listEtaTrackingContacts(
  clientId: string,
  opts?: { legIcaos?: string[] },
): ClientContact[] {
  const cl = getClient(clientId)
  if (!cl) return []
  const legs = opts?.legIcaos ?? []
  return cl.contacts.filter((c) => {
    if (!c.email) return false
    if (c.notify_prefs.tracker || c.role === 'supply_chain') return true
    if (
      legs.length &&
      c.eta_icaos?.some((code) =>
        legs.some((leg) => icaoCodesMatch(code, leg)),
      )
    ) {
      return true
    }
    return false
  })
}

/**
 * Directory mix: people + DLs, with base supervisor/stores DLs folded in
 * when not already present as contacts (synthetic ids prefixed `base:`).
 */
export function listMixedDirectoryContacts(clientId: string): ClientContact[] {
  const cl = getClient(clientId)
  if (!cl) return []
  const byEmail = new Map<string, ClientContact>()
  for (const c of cl.contacts) {
    if (!c.email) continue
    byEmail.set(c.email.toLowerCase(), { ...c, kind: c.kind ?? 'person' })
  }
  for (const base of cl.profile.bases ?? []) {
    const icao = (base.icao ?? '').trim().toUpperCase()
    if (!icao) continue
    const slots: Array<{ emails: string[]; title: string }> = [
      {
        emails: base.supervisor_emails ?? [],
        title: `${icao} Supervisors`,
      },
      {
        emails: base.stores_emails ?? [],
        title: `${icao} Stores`,
      },
    ]
    for (const slot of slots) {
      for (const email of slot.emails) {
        const key = email.trim().toLowerCase()
        if (!key.includes('@')) continue
        const existing = byEmail.get(key)
        if (existing) {
          const set = new Set([
            ...(existing.eta_icaos ?? []),
            icao,
          ])
          existing.eta_icaos = [...set]
          if (!existing.title) existing.title = slot.title
          existing.kind = existing.kind ?? 'dl'
          continue
        }
        byEmail.set(key, {
          id: `base:${icao}:${key}`,
          name: slot.title,
          email: email.trim(),
          cell: '',
          role: 'supply_chain',
          kind: 'dl',
          title: slot.title,
          eta_icaos: [icao],
          notify_prefs: {
            request_alert: false,
            invoice: false,
            tracker: false,
          },
        })
      }
    }
  }
  return [...byEmail.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dl' ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}

export function rememberEmailsOnClient(
  clientId: string,
  invoiceEmail: string,
  ccEmails: string[],
  /** ETA / tracking extras — stored as supply_chain, not AP. */
  etaEmails: string[] = [],
): void {
  const row = clients.get(clientId)
  if (!row) return
  const skipOps = (email: string) =>
    email.trim().toLowerCase() === ONFLY_INFO_BCC
  const inv = invoiceEmail.trim()
  if (inv && !skipOps(inv)) {
    row.invoice_email = inv
    if (!row.contacts.some((c) => c.email.toLowerCase() === inv.toLowerCase())) {
      row.contacts.push({
        id: crypto.randomUUID(),
        name: inv.split('@')[0] ?? inv,
        email: inv,
        cell: '',
        role: 'ap',
        kind: 'person',
        notify_prefs: defaultPrefs('ap'),
      })
    }
  }
  for (const raw of ccEmails) {
    const email = raw.trim()
    if (!email || !email.includes('@') || skipOps(email)) continue
    if (row.contacts.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      continue
    }
    row.contacts.push({
      id: crypto.randomUUID(),
      name: email.split('@')[0] ?? email,
      email,
      cell: '',
      role: 'ap',
      kind: 'person',
      notify_prefs: defaultPrefs('ap'),
    })
  }
  for (const raw of etaEmails) {
    const email = raw.trim()
    if (!email || !email.includes('@') || skipOps(email)) continue
    if (row.contacts.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      continue
    }
    row.contacts.push({
      id: crypto.randomUUID(),
      name: email.split('@')[0] ?? email,
      email,
      cell: '',
      role: 'supply_chain',
      kind: 'dl',
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

export function recordPoUsed(
  clientId: string,
  po: string,
  opts?: { tripRef?: string | null },
): void {
  const row = clients.get(clientId)
  if (!row) return
  row.last_po = po.trim()
  const tripRef = opts?.tripRef?.trim()
  if (tripRef) {
    row.profile = { ...row.profile, last_po_trip_ref: tripRef }
  }
  bump(clientId)
}

/** Persist optional vendor # on the client profile. */
export function recordVendorNumber(
  clientId: string,
  vendorNumber: string | null | undefined,
): void {
  const row = clients.get(clientId)
  if (!row) return
  const v = vendorNumber?.trim() || null
  row.profile = { ...row.profile, vendor_number: v }
  bump(clientId)
}
