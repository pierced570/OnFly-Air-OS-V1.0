/**
 * Boot-time hydrate: pull real operating rows from Supabase into session stores.
 */

import type { Lead } from '@/domain/leads'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import {
  replaceClientsFromDb,
  type ClientProfile,
  type ContactRole,
  DEFAULT_CLIENT_RULES,
} from '@/lib/clientStore'
import { replaceFbosFromDb, type FboRow } from '@/lib/fboStore'
import { hydrateTrips } from '@/lib/db/hydrateTrips'
import { replaceIntakeFromDb, type IntakeDraft } from '@/lib/intakeStore'
import { replaceLeadsFromDb } from '@/lib/leadStore'
import { replaceNeedsInfoFromDb, type NeedsInfoTask } from '@/lib/needsInfoStore'
import { loadPricingPriors } from '@/lib/pricingPriorsStore'
import { hydrateShiftFromDb } from '@/lib/shiftStore'
import { loadTaxRates } from '@/lib/taxRatesStore'

export async function hydrateOperatingData(): Promise<{
  ok: boolean
  clients: number
  fbos: number
  tasks: number
  leads: number
  trips: number
}> {
  if (!canPersist()) {
    return { ok: false, clients: 0, fbos: 0, tasks: 0, leads: 0, trips: 0 }
  }

  await Promise.all([loadTaxRates(), loadPricingPriors()])
  void import('@/lib/scorecards').then((m) => m.loadScorecards())

  const clientRows = await safeQuery('clients', () =>
    db()
      .from('clients')
      .select(
        'id,name,billing_terms,qb_customer_id,notes,invoice_email,last_po,po_prefix,legacy_key,profile,client_contacts(id,name,role,email,cell,notify_prefs),client_rules(*)',
      )
      .order('name'),
  )

  let clients = 0
  if (clientRows && Array.isArray(clientRows) && clientRows.length) {
    const mapped: ClientProfile[] = clientRows.map((r: Record<string, unknown>) => {
      const contactsRaw = (r.client_contacts as Array<Record<string, unknown>>) ?? []
      const rulesRaw = (r.client_rules as Array<Record<string, unknown>>)?.[0]
      return {
        id: String(r.legacy_key || r.id),
        name: String(r.name ?? ''),
        email: '',
        invoice_email: String(r.invoice_email ?? ''),
        contacts: contactsRaw.map((c) => {
          const p = (c.notify_prefs as Record<string, boolean>) ?? {}
          return {
            id: String(c.id),
            name: String(c.name ?? ''),
            email: String(c.email ?? ''),
            cell: String(c.cell ?? ''),
            role: (c.role as ContactRole) || 'requester',
            notify_prefs: {
              request_alert: Boolean(p.request_alert),
              invoice: Boolean(p.invoice),
              tracker: Boolean(p.tracker),
            },
          }
        }),
        last_po: r.last_po ? String(r.last_po) : null,
        po_prefix: r.po_prefix
          ? String(r.po_prefix)
          : r.last_po
            ? String(r.last_po).match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() ?? null
            : null,
        pay_terms: String(r.billing_terms ?? 'Net 30'),
        notes: String(r.notes ?? ''),
        rules: {
          ...DEFAULT_CLIENT_RULES,
          dual_pilot_required: Boolean(rulesRaw?.dual_pilot_required),
          freight_only: Boolean(rulesRaw?.freight_only),
          multi_engine_only: Boolean(rulesRaw?.multi_engine_only),
          no_single_engine_night: Boolean(rulesRaw?.no_single_engine_night),
          hazmat_allowed:
            rulesRaw?.hazmat_allowed == null
              ? true
              : Boolean(rulesRaw.hazmat_allowed),
          declared_value_norm: rulesRaw?.max_declared_value
            ? String(rulesRaw.max_declared_value)
            : '',
        },
        qb_customer_id: r.qb_customer_id ? String(r.qb_customer_id) : null,
        profile:
          r.profile && typeof r.profile === 'object'
            ? (r.profile as ClientProfile['profile'])
            : {},
      }
    })
    replaceClientsFromDb(mapped)
    clients = mapped.length
  }

  const fboRows = await safeQuery('fbos', () =>
    db().from('fbos').select('*').order('icao'),
  )
  let fbos = 0
  if (fboRows && Array.isArray(fboRows) && fboRows.length) {
    const mapped: FboRow[] = fboRows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      airport_icao: String(r.icao ?? ''),
      phone: String(r.phone ?? ''),
      after_hours_phone: String(r.after_hours_phone ?? ''),
      is_24hr: Boolean(r.is_24hr),
      forklift: Boolean(r.forklift),
      forklift_capacity_lbs:
        r.forklift_capacity_lbs == null ? null : Number(r.forklift_capacity_lbs),
      gl_insurance: Boolean(r.gl_insurance),
      gl_coverage: r.gl_coverage == null ? null : Number(r.gl_coverage),
      fee_handling: r.handling_fee == null ? null : Number(r.handling_fee),
      fee_ramp: r.ramp_fee == null ? null : Number(r.ramp_fee),
      fee_overnight: r.overnight_fee == null ? null : Number(r.overnight_fee),
      fee_callout: r.callout_fee == null ? null : Number(r.callout_fee),
      fees_waived_with_fuel: Boolean(r.fees_waived_with_fuel),
      street: String(r.street ?? ''),
      city: String(r.city ?? ''),
      state: String(r.state ?? ''),
      zip: String(r.zip ?? ''),
      lat: r.lat == null ? null : Number(r.lat),
      lon: r.lon == null ? null : Number(r.lon),
      notes: String(r.notes ?? ''),
      last_verified: r.last_verified
        ? String(r.last_verified).slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      needs_info: Array.isArray(r.needs_info) ? (r.needs_info as string[]) : [],
    }))
    replaceFbosFromDb(mapped)
    fbos = mapped.length
  }

  const taskRows = await safeQuery('needs_info_tasks', () =>
    db().from('needs_info_tasks').select('*').is('resolved_at', null).limit(500),
  )
  let tasks = 0
  if (taskRows && Array.isArray(taskRows) && taskRows.length) {
    const mapped: NeedsInfoTask[] = taskRows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      entity_type: (String(r.entity ?? 'operator') as NeedsInfoTask['entity_type']),
      entity_id: String(r.entity_id ?? ''),
      entity_label: String(r.note ?? r.field ?? r.entity_id ?? ''),
      field: String(r.field ?? ''),
      note: String(r.note ?? ''),
      status: r.resolved_at ? 'resolved' : 'open',
      wizard: null,
      created_at: String(r.created_at ?? new Date().toISOString()),
      resolved_at: r.resolved_at ? String(r.resolved_at) : null,
    }))
    replaceNeedsInfoFromDb(mapped)
    tasks = mapped.length
  }

  const shiftRows = await safeQuery('shifts', () =>
    db()
      .from('shifts')
      .select('*')
      .eq('active', true)
      .order('starts_at', { ascending: false })
      .limit(1),
  )
  if (shiftRows && Array.isArray(shiftRows) && shiftRows[0]) {
    const s = shiftRows[0] as Record<string, unknown>
    hydrateShiftFromDb({
      id: String(s.id),
      person_name: String(s.person ?? 'Dispatcher'),
      phone: String(s.phone ?? ''),
      started_at: String(s.starts_at ?? new Date().toISOString()),
      ended_at: null,
      notes: String(s.notes ?? ''),
    })
  }

  const leadRows = await safeQuery('leads', () =>
    db().from('leads').select('*').order('next_follow_up_at', { ascending: true }).limit(1000),
  )
  let leads = 0
  if (leadRows && Array.isArray(leadRows) && leadRows.length) {
    const mapped: Lead[] = leadRows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      company: String(r.company ?? ''),
      contact_name: String(r.contact_name ?? ''),
      title: String(r.title ?? ''),
      email: String(r.email ?? ''),
      phone: String(r.phone ?? ''),
      kind: (String(r.kind ?? 'other') as Lead['kind']),
      status: (String(r.status ?? 'open') as Lead['status']),
      last_contacted_at: r.last_contacted_at ? String(r.last_contacted_at) : null,
      next_follow_up_at: r.next_follow_up_at ? String(r.next_follow_up_at) : null,
      notes: String(r.notes ?? ''),
      last_touch_note: String(r.last_touch_note ?? ''),
      owner: String(r.owner ?? ''),
      created_at: String(r.created_at ?? new Date().toISOString()),
      updated_at: String(r.updated_at ?? new Date().toISOString()),
    }))
    replaceLeadsFromDb(mapped)
    leads = mapped.length
  }

  const trips = await hydrateTrips()

  const intakeRows = await safeQuery('intake_drafts', () =>
    db()
      .from('intake_drafts')
      .select('*')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(100),
  )
  if (Array.isArray(intakeRows) && intakeRows.length) {
    const mapped: IntakeDraft[] = intakeRows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      channel: (String(r.channel) as IntakeDraft['channel']) || 'email',
      from: String(r.from_addr ?? ''),
      subject: String(r.subject ?? ''),
      body: String(r.body ?? ''),
      created_at: String(r.created_at ?? new Date().toISOString()),
      status: (String(r.status) as IntakeDraft['status']) || 'pending_review',
      extracted: (r.extracted as IntakeDraft['extracted']) ?? null,
      ignore_reason: r.ignore_reason ? String(r.ignore_reason) : undefined,
      notified_phone: r.notified_phone ? String(r.notified_phone) : undefined,
    }))
    replaceIntakeFromDb(mapped)
  }

  return { ok: true, clients, fbos, tasks, leads, trips }
}
