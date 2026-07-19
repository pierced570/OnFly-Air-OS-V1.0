/**
 * Upsert Admin/onboard operator drafts into operators + contacts + aircraft.
 */

import type { OperatorDraft } from '@/lib/operatorDraftStore'
import { canPersist, db, safeQuery } from '@/lib/db/client'

export async function persistOperatorDraft(
  draft: OperatorDraft,
): Promise<boolean> {
  if (!canPersist()) return false

  const caps = {
    cargo: draft.capabilities.cargo,
    pax: draft.capabilities.pax,
    hazmat: draft.capabilities.hazmat,
    medivac: draft.capabilities.medivac,
    ops_24hr: draft.capabilities.ops_24hr,
    callout_min: draft.capabilities.callout_min,
  }
  const crew = {
    single_pilot_ok: draft.crew.single_pilot_ok,
    dual_available: draft.crew.dual_available,
    night_policy: draft.crew.night_policy,
  }

  const op = await safeQuery('operators.upsert', () =>
    db().from('operators').upsert(
      {
        id: draft.id,
        name: draft.name.trim() || draft.dba.trim() || 'Operator',
        base_icao: draft.base_icao.trim().toUpperCase() || null,
        region: draft.region.trim() || null,
        certificate_no: draft.certificate.trim() || null,
        capabilities: caps,
        crew_policy: crew,
        onboarding_status: 'draft',
        notes: draft.rates_note || null,
        needs_info: [],
      },
      { onConflict: 'id' },
    ),
  )
  if (op === null) {
    // name unique conflict — try update by name
    await safeQuery('operators.upsert_by_name', () =>
      db()
        .from('operators')
        .upsert(
          {
            name: draft.name.trim() || draft.dba.trim() || 'Operator',
            base_icao: draft.base_icao.trim().toUpperCase() || null,
            region: draft.region.trim() || null,
            certificate_no: draft.certificate.trim() || null,
            capabilities: caps,
            crew_policy: crew,
            onboarding_status: 'draft',
            notes: draft.rates_note || null,
          },
          { onConflict: 'name' },
        ),
    )
  }

  for (const c of draft.contacts) {
    if (!c.name.trim() && !c.cell.trim() && !c.email.trim()) continue
    await safeQuery('operator_contacts.insert', () =>
      db().from('operator_contacts').insert({
        operator_id: draft.id,
        name: c.name.trim() || 'Contact',
        role: c.role || 'ops',
        cell: c.cell || null,
        email: c.email || null,
        consent_sms: c.consent_sms,
        consent_call: c.consent_call,
      }),
    )
  }

  for (const a of draft.aircraft) {
    if (!a.tail.trim()) continue
    await safeQuery('aircraft.upsert', () =>
      db().from('aircraft').upsert(
        {
          operator_id: draft.id,
          tail: a.tail.trim().toUpperCase(),
          type_name: a.type_name || null,
          insurance_expiry: a.insurance_expiry || null,
          base_icao: draft.base_icao.trim().toUpperCase() || null,
        },
        { onConflict: 'operator_id,tail' },
      ),
    )
  }

  return true
}

/** Persist compliance doc metadata into documents table. */
export async function persistOperatorComplianceDoc(opts: {
  operatorId: string
  kind: string
  storagePath: string | null
  expiresOn: string | null
  fileName: string | null
}): Promise<void> {
  if (!canPersist()) return
  await safeQuery('documents.operator_doc', () =>
    db().from('documents').insert({
      operator_id: opts.operatorId,
      kind: opts.kind,
      storage_path: opts.storagePath,
      expires_on: opts.expiresOn,
      parsed: { file_name: opts.fileName },
      rendered_at: new Date().toISOString(),
    }),
  )
}

export async function persistNamedInsurer(
  operatorId: string,
  named: boolean,
): Promise<void> {
  if (!canPersist()) return
  await safeQuery('operators.named_insurer', () =>
    db().from('operators').update({ named_insurer: named }).eq('id', operatorId),
  )
}
