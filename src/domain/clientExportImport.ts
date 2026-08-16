/**
 * Parse OnFly clients-export CSV → import drafts (pure).
 * record_type: CLIENT | CONTACT | BASE | DIAGRAM
 */

import {
  domainFromEmail,
  isPublicEmailDomain,
  normalizeBaseIcao,
  normalizeEmailList,
  syncBaseEmailFields,
  type ClientBaseRef,
} from './clientBaseEmails'
import { withEnsuredPortalDomains } from './portalDomains'

export type ContactRoleDraft = 'requester' | 'ap' | 'supply_chain'
export type ContactKindDraft = 'person' | 'dl'

export type ContactNotifyDraft = {
  request_alert: boolean
  invoice: boolean
  tracker: boolean
}

export type ContactDraft = {
  name: string
  email: string
  cell: string
  role: ContactRoleDraft
  kind: ContactKindDraft
  title?: string
  eta_icaos?: string[]
  notify_prefs: ContactNotifyDraft
}

export type ClientRulesDraft = {
  dual_pilot_required: boolean
  freight_only: boolean
  multi_engine_only: boolean
  single_engine_turboprop_only: boolean
  no_single_engine_night: boolean
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  exceptions_with_permission: boolean
  other_rules: string[]
}

export type ClientImportDraft = {
  legacy_key: string
  name: string
  email: string
  invoice_email: string
  pay_terms: string
  po_prefix: string | null
  notes: string
  contacts: ContactDraft[]
  rules: ClientRulesDraft
  profile: {
    source: 'import'
    front_desk_phone?: string
    ops_callback_phone?: string
    emergency?: { name: string; email: string; phone: string }
    billing_address?: {
      street: string
      city: string
      state: string
      zip: string
    }
    vendor_number?: string | null
    needs_vendor_number?: boolean
    passenger_policy?: {
      no_single_engine: boolean
      no_single_engine_pistons: boolean
      dual_pilot_required: boolean
      other_restriction: boolean
      other_notes: string
    }
    bases?: ClientBaseRef[]
    allowed_email_domains?: string[]
  }
}

function truthy(v: string | undefined): boolean {
  return /^(1|true|yes|y)$/i.test((v ?? '').trim())
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cur.push(field)
      field = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(field)
      field = ''
      if (cur.some((c) => c.trim())) rows.push(cur)
      cur = []
      continue
    }
    field += ch
  }
  if (field.length || cur.length) {
    cur.push(field)
    if (cur.some((c) => c.trim())) rows.push(cur)
  }
  if (!rows.length) return []
  const header = rows[0]!.map((h) => h.trim())
  return rows.slice(1).map((cols) => {
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim()
    })
    return row
  })
}

export function parseBillingAddress(
  raw: string,
): ClientImportDraft['profile']['billing_address'] {
  const s = raw.trim()
  if (!s) return undefined
  const m = s.match(
    /^(.+?),\s*([^,]+),\s*([A-Z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)\s*$/i,
  )
  if (m) {
    return {
      street: m[1]!.trim(),
      city: m[2]!.trim(),
      state: m[3]!.trim().toUpperCase(),
      zip: m[4]!.trim(),
    }
  }
  return { street: s, city: '', state: '', zip: '' }
}

export function mapContactKind(contactType: string): ContactKindDraft {
  const t = contactType.trim().toLowerCase()
  if (t === 'person' || t === 'primary') return 'person'
  if (
    t === 'dl' ||
    t === 'distribution_list' ||
    t === 'operations' ||
    t === 'billing' ||
    t === 'accounts_payable'
  ) {
    return 'dl'
  }
  if (!t) return 'person'
  return t.includes('list') ? 'dl' : 'person'
}

export function mapContactRole(
  contactType: string,
  prefs: ContactNotifyDraft,
): ContactRoleDraft {
  const t = contactType.trim().toLowerCase()
  if (t === 'billing' || t === 'accounts_payable') return 'ap'
  if (prefs.invoice && !prefs.request_alert && !prefs.tracker) return 'ap'
  if (prefs.request_alert || t === 'primary' || t === 'operations') {
    return 'requester'
  }
  return 'supply_chain'
}

export function extractPassengerRulesFromNotes(notes: string): {
  dual_pilot_required?: boolean
  multi_engine_only?: boolean
  passenger_policy?: ClientImportDraft['profile']['passenger_policy']
} {
  const n = notes.toUpperCase()
  if (!n.includes('2 PILOTS') && !n.includes('2 ENGINES')) return {}
  return {
    dual_pilot_required: n.includes('2 PILOTS'),
    multi_engine_only: n.includes('2 ENGINES') || n.includes('MULTI'),
    passenger_policy: {
      no_single_engine: true,
      no_single_engine_pistons: true,
      dual_pilot_required: n.includes('2 PILOTS'),
      other_restriction: false,
      other_notes: notes.trim(),
    },
  }
}

function guessPoPrefix(name: string): string | null {
  const n = name.trim().toLowerCase()
  if (n.includes('psa')) return 'PSA'
  if (n.includes('endeavor')) return 'EDV'
  if (n.includes('piedmont')) return 'PDT'
  if (n.includes('kalitta')) return 'CKS'
  return null
}

/** Strip legal suffixes / punctuation for directory name matching. */
export function normalizeClientDirectoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|corp|co|ltd|limited)\.?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Known short ledger labels → export company names.
 * Financials often stores "PSA" / "Kalitta" while the export uses the full legal name.
 */
const DIRECTORY_NAME_ALIASES: Record<string, string> = {
  psa: 'psa airlines',
  pdt: 'piedmont airlines',
  piedmont: 'piedmont airlines',
  kalitta: 'kalitta air',
  athelo: 'athelo group',
  'athelo group': 'athelo group',
}

function aliasCanonical(norm: string): string {
  return DIRECTORY_NAME_ALIASES[norm] ?? norm
}

/** True when two directory names refer to the same client (soft match). */
export function clientDirectoryNamesMatch(a: string, b: string): boolean {
  const na = aliasCanonical(normalizeClientDirectoryName(a))
  const nb = aliasCanonical(normalizeClientDirectoryName(b))
  if (!na || !nb) return false
  if (na === nb) return true
  // Prefix: "Athelo Group" ↔ "Athelo Group LLC", "PSA" ↔ "PSA Airlines"
  if (na.length >= 3 && nb.startsWith(na)) return true
  if (nb.length >= 3 && na.startsWith(nb)) return true
  return false
}

function collectDomains(emails: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of emails) {
    const d = domainFromEmail(e)
    if (!d || isPublicEmailDomain(d) || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

const emptyRules = (): ClientRulesDraft => ({
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
})

export function profilesFromClientExportCsv(csvText: string): ClientImportDraft[] {
  const rawRows = parseCsv(csvText)
  const byName = new Map<
    string,
    {
      draft: ClientImportDraft
      contactEmails: Map<string, ContactDraft>
      bases: Map<string, ClientBaseRef>
    }
  >()

  function ensure(name: string) {
    const key = name.trim().toLowerCase()
    let hit = byName.get(key)
    if (hit) return hit
    const legacy_key = `import-${key.replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'client'}`
    hit = {
      draft: {
        legacy_key,
        name: name.trim(),
        email: '',
        invoice_email: '',
        pay_terms: 'Net 30',
        po_prefix: guessPoPrefix(name),
        notes: '',
        contacts: [],
        rules: emptyRules(),
        profile: { source: 'import' },
      },
      contactEmails: new Map(),
      bases: new Map(),
    }
    byName.set(key, hit)
    return hit
  }

  for (const r of rawRows) {
    const type = (r.record_type ?? '').trim().toUpperCase()
    const name = (r.client_name || r.company_name || '').trim()
    if (!name) continue
    const bucket = ensure(name)
    const p = bucket.draft

    if (type === 'CLIENT') {
      if (r.billing_email) p.invoice_email = r.billing_email.trim()
      if (r.pay_terms) p.pay_terms = r.pay_terms.trim()
      if (r.notes) p.notes = r.notes.trim()
      const extracted = extractPassengerRulesFromNotes(r.notes ?? '')
      if (extracted.dual_pilot_required != null) {
        p.rules.dual_pilot_required = Boolean(extracted.dual_pilot_required)
      }
      if (extracted.multi_engine_only != null) {
        p.rules.multi_engine_only = Boolean(extracted.multi_engine_only)
      }
      if (extracted.passenger_policy) {
        p.profile.passenger_policy = extracted.passenger_policy
      }
      if (r.vendor_number?.trim()) {
        p.profile.vendor_number = r.vendor_number.trim()
        p.profile.needs_vendor_number = true
      }
      if (r.inbound_phone?.trim()) {
        p.profile.front_desk_phone = r.inbound_phone.trim()
      }
      if (r.outbound_phone?.trim()) {
        p.profile.ops_callback_phone = r.outbound_phone.trim()
      }
      if (r.emergency_contact_name?.trim() || r.emergency_contact_phone?.trim()) {
        p.profile.emergency = {
          name: (r.emergency_contact_name ?? '').trim(),
          phone: (r.emergency_contact_phone ?? '').trim(),
          email: '',
        }
      }
      const addr = parseBillingAddress(r.billing_address ?? '')
      if (addr) p.profile.billing_address = addr
      continue
    }

    if (type === 'CONTACT') {
      const email = (r.contact_email ?? '').trim()
      if (!email.includes('@')) continue
      const prefs: ContactNotifyDraft = {
        request_alert: truthy(r.receives_quotes),
        invoice: truthy(r.receives_invoices),
        tracker: truthy(r.receives_itineraries),
      }
      const kindFinal = mapContactKind(r.contact_type ?? '')
      const role = mapContactRole(r.contact_type ?? '', prefs)
      const title = (r.contact_role ?? '').trim() || undefined
      const key = email.toLowerCase()
      const existing = bucket.contactEmails.get(key)
      if (existing) {
        existing.notify_prefs = {
          request_alert:
            existing.notify_prefs.request_alert || prefs.request_alert,
          invoice: existing.notify_prefs.invoice || prefs.invoice,
          tracker: existing.notify_prefs.tracker || prefs.tracker,
        }
        if (title && !existing.title) existing.title = title
        if (r.contact_phone?.trim() && !existing.cell) {
          existing.cell = r.contact_phone.trim()
        }
      } else {
        bucket.contactEmails.set(key, {
          name: (r.contact_name ?? '').trim() || email.split('@')[0] || email,
          email,
          cell: (r.contact_phone ?? '').trim(),
          role,
          kind: kindFinal,
          title,
          notify_prefs: prefs,
        })
      }
      if (prefs.invoice && !p.invoice_email) p.invoice_email = email
      if (prefs.request_alert && !p.email) p.email = email
      continue
    }

    if (type === 'BASE') {
      const icao = normalizeBaseIcao(r.base_code || r.base_name || '')
      if (!icao) continue
      const prev = bucket.bases.get(icao) ?? { icao }
      const next = syncBaseEmailFields({
        ...prev,
        icao,
        label: (r.base_name ?? '').trim() || prev.label,
        supervisor_emails: [
          ...(prev.supervisor_emails ?? []),
          ...normalizeEmailList(r.supervisor_emails),
        ],
        stores_emails: [
          ...(prev.stores_emails ?? []),
          ...normalizeEmailList(r.stores_emails),
        ],
      })
      bucket.bases.set(icao, next)
      for (const [emails, title] of [
        [next.supervisor_emails ?? [], `${icao} Supervisors`],
        [next.stores_emails ?? [], `${icao} Stores`],
      ] as const) {
        for (const email of emails) {
          const key = email.toLowerCase()
          const existing = bucket.contactEmails.get(key)
          if (existing) {
            const set = new Set([...(existing.eta_icaos ?? []), icao])
            existing.eta_icaos = [...set]
            existing.kind = 'dl'
            if (!existing.title) existing.title = title
          } else {
            bucket.contactEmails.set(key, {
              name: title,
              email,
              cell: '',
              role: 'supply_chain',
              kind: 'dl',
              title,
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
      continue
    }

    if (type === 'DIAGRAM') {
      const icao = normalizeBaseIcao(r.base_code || '')
      if (!icao) continue
      const prev = bucket.bases.get(icao) ?? { icao }
      bucket.bases.set(icao, {
        ...prev,
        diagram_url: (r.diagram_url ?? '').trim() || prev.diagram_url,
        diagram_caption:
          (r.diagram_caption ?? '').trim() || prev.diagram_caption,
      })
    }
  }

  const out: ClientImportDraft[] = []
  for (const bucket of byName.values()) {
    const p = bucket.draft
    p.contacts = [...bucket.contactEmails.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    p.profile.bases = [...bucket.bases.values()]
      .map(syncBaseEmailFields)
      .sort((a, b) => a.icao.localeCompare(b.icao))
    p.profile.allowed_email_domains = collectDomains([
      p.invoice_email,
      p.email,
      ...p.contacts.map((c) => c.email),
    ])
    if (!p.email) {
      const ops = p.contacts.find((c) => c.notify_prefs.request_alert)
      p.email = ops?.email || p.contacts[0]?.email || p.invoice_email || ''
    }
    out.push(withEnsuredPortalDomains(p))
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
