/**
 * Write session mutations back to Supabase (best-effort).
 */

import { lookupAirport } from '@/domain/airports'
import type { Lead } from '@/domain/leads'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import type { ClientProfile } from '@/lib/clientStore'
import type { FboRow } from '@/lib/fboStore'
import type { ShiftRow } from '@/lib/shiftStore'

async function ensureAirport(icao: string): Promise<void> {
  const code = icao.toUpperCase()
  const ap = lookupAirport(code)
  await safeQuery('airports.upsert', () =>
    db()
      .from('airports')
      .upsert(
        {
          icao: code,
          name: ap?.name ?? code,
          city: ap?.city ?? null,
          state: ap?.state ?? null,
          lat: ap?.lat ?? null,
          lon: ap?.lon ?? null,
          tz: ap?.tz ?? null,
        },
        { onConflict: 'icao' },
      ),
  )
}

function idOf(row: unknown): string | null {
  if (row && typeof row === 'object' && 'id' in row) {
    return String((row as { id: string }).id)
  }
  return null
}

async function resolveClientDbId(client: ClientProfile): Promise<string | null> {
  const legacy = client.id
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      legacy,
    )
  if (isUuid) {
    const found = await safeQuery<unknown>('clients.by_id', () =>
      db().from('clients').select('id').eq('id', legacy).maybeSingle(),
    )
    const id = idOf(found)
    if (id) return id
  }
  const byKey = await safeQuery<unknown>('clients.by_legacy', () =>
    db().from('clients').select('id').eq('legacy_key', legacy).maybeSingle(),
  )
  const byKeyId = idOf(byKey)
  if (byKeyId) return byKeyId

  const inserted = await safeQuery<unknown>('clients.insert', () =>
    db()
      .from('clients')
      .insert({
        ...(isUuid ? { id: legacy } : {}),
        legacy_key: isUuid ? null : legacy,
        name: client.name,
        billing_terms: client.pay_terms,
        qb_customer_id: client.qb_customer_id,
        notes: client.notes,
        invoice_email: client.invoice_email,
        last_po: client.last_po,
        po_prefix: client.po_prefix,
        profile: client.profile ?? {},
      })
      .select('id')
      .maybeSingle(),
  )
  return idOf(inserted)
}

export async function persistClient(client: ClientProfile): Promise<void> {
  if (!canPersist()) return
  const dbId = await resolveClientDbId(client)
  if (!dbId) return

  await safeQuery('clients.update', () =>
    db()
      .from('clients')
      .update({
        name: client.name,
        billing_terms: client.pay_terms,
        qb_customer_id: client.qb_customer_id,
        notes: client.notes,
        invoice_email: client.invoice_email,
        last_po: client.last_po,
        po_prefix: client.po_prefix,
        profile: client.profile ?? {},
      })
      .eq('id', dbId),
  )

  await safeQuery('client_rules.delete', () =>
    db().from('client_rules').delete().eq('client_id', dbId),
  )
  await safeQuery('client_rules.insert', () =>
    db().from('client_rules').insert({
      client_id: dbId,
      dual_pilot_required: client.rules.dual_pilot_required,
      freight_only: client.rules.freight_only,
      multi_engine_only: client.rules.multi_engine_only,
      no_single_engine_night: client.rules.no_single_engine_night,
      hazmat_allowed: client.rules.hazmat_allowed,
      other_rules: { list: client.rules.other_rules },
    }),
  )

  await safeQuery('client_contacts.delete', () =>
    db().from('client_contacts').delete().eq('client_id', dbId),
  )
  if (client.contacts.length) {
    await safeQuery('client_contacts.insert', () =>
      db()
        .from('client_contacts')
        .insert(
          client.contacts.map((c) => ({
            client_id: dbId,
            name: c.name,
            role: c.role,
            email: c.email || null,
            cell: c.cell || null,
            notify_prefs: c.notify_prefs,
          })),
        ),
    )
  }
}

export async function persistFbo(fbo: FboRow): Promise<void> {
  if (!canPersist()) return
  await ensureAirport(fbo.airport_icao)
  const existing = await safeQuery('fbos.by_id', () =>
    db().from('fbos').select('id').eq('id', fbo.id).maybeSingle(),
  )
  const payload = {
    icao: fbo.airport_icao.toUpperCase(),
    name: fbo.name,
    phone: fbo.phone || null,
    after_hours_phone: fbo.after_hours_phone || null,
    is_24hr: fbo.is_24hr,
    forklift: fbo.forklift,
    forklift_capacity_lbs: fbo.forklift_capacity_lbs,
    gl_insurance: fbo.gl_insurance,
    gl_coverage: fbo.gl_coverage,
    handling_fee: fbo.fee_handling,
    ramp_fee: fbo.fee_ramp,
    overnight_fee: fbo.fee_overnight,
    callout_fee: fbo.fee_callout,
    fees_waived_with_fuel: fbo.fees_waived_with_fuel,
    last_verified: fbo.last_verified,
    needs_info: fbo.needs_info,
    street: fbo.street || null,
    city: fbo.city || null,
    state: fbo.state || null,
    zip: fbo.zip || null,
    lat: fbo.lat,
    lon: fbo.lon,
    notes: fbo.notes || null,
  }
  if (existing && typeof existing === 'object' && 'id' in existing) {
    await safeQuery('fbos.update', () =>
      db().from('fbos').update(payload).eq('id', fbo.id),
    )
  } else {
    await safeQuery('fbos.insert', () =>
      db().from('fbos').insert({ id: fbo.id, ...payload }),
    )
  }
}

export async function persistShiftStart(shift: ShiftRow): Promise<void> {
  if (!canPersist()) return
  // Multi-dispatcher: do not deactivate other active shifts
  await safeQuery('shifts.upsert', () =>
    db().from('shifts').upsert(
      {
        id: shift.id,
        person: shift.person_name,
        phone: shift.phone,
        starts_at: shift.started_at,
        ends_at: null,
        active: true,
        notes: shift.notes,
      },
      { onConflict: 'id' },
    ),
  )
}

export async function persistShiftEnd(shiftId: string): Promise<void> {
  if (!canPersist()) return
  await safeQuery('shifts.end', () =>
    db()
      .from('shifts')
      .update({ active: false, ends_at: new Date().toISOString() })
      .eq('id', shiftId),
  )
}

export async function persistStaffPresence(row: {
  staff_id: string
  name: string
  phone: string
  last_seen_at: string
}): Promise<void> {
  if (!canPersist()) return
  await safeQuery('staff_presence.upsert', () =>
    db().from('staff_presence').upsert(
      {
        staff_id: row.staff_id,
        name: row.name,
        phone: row.phone,
        last_seen_at: row.last_seen_at,
      },
      { onConflict: 'staff_id' },
    ),
  )
}

export async function clearStaffPresence(staffId: string): Promise<void> {
  if (!canPersist()) return
  await safeQuery('staff_presence.delete', () =>
    db().from('staff_presence').delete().eq('staff_id', staffId),
  )
}

export async function persistCommsMessage(opts: {
  channel: 'sms' | 'email' | 'voice' | 'web'
  to_addr: string
  body: string
  trip_id?: string | null
  direction?: 'out' | 'in'
}): Promise<void> {
  if (!canPersist()) return
  await safeQuery('comms_messages.insert', () =>
    db().from('comms_messages').insert({
      channel: opts.channel,
      direction: opts.direction ?? 'out',
      to_ref: opts.to_addr,
      body: opts.body,
      trip_id: opts.trip_id ?? null,
      delivery_status: 'sent',
    }),
  )
}

export async function persistLead(lead: Lead): Promise<void> {
  if (!canPersist()) return
  await safeQuery('leads.upsert', () =>
    db().from('leads').upsert(
      {
        id: lead.id,
        company: lead.company,
        contact_name: lead.contact_name,
        title: lead.title,
        email: lead.email,
        phone: lead.phone,
        kind: lead.kind,
        status: lead.status,
        last_contacted_at: lead.last_contacted_at,
        next_follow_up_at: lead.next_follow_up_at,
        notes: lead.notes,
        last_touch_note: lead.last_touch_note,
        owner: lead.owner,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
      },
      { onConflict: 'id' },
    ),
  )
}

export async function deleteLead(id: string): Promise<void> {
  if (!canPersist()) return
  await safeQuery('leads.delete', () => db().from('leads').delete().eq('id', id))
}
