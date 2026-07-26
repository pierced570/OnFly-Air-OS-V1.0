/**
 * Accept operator network packet → draft + docs + D085 tails.
 */

import {
  packetCompleteness,
  quotePrefToLinkChannel,
  type OperatorBanking,
  type QuoteContactPref,
} from '@/domain/operatorPacket'
import { addNeedsInfoTask } from '@/lib/needsInfoStore'
import {
  ensureOperatorCompliance,
  setOperatorDocFile,
} from '@/lib/operatorComplianceStore'
import { saveOperatorDraft } from '@/lib/operatorDraftStore'
import { markInviteCompleted } from '@/lib/operatorInviteStore'
import { submitOperatorOnboard } from '@/lib/operatorOnboardStore'
import { parseD085File } from '@/lib/parseD085File'
import { loadNetwork, upsertCachedOperator } from '@/lib/networkData'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { OperatorRow } from '@/lib/types'
import { watchTailsFromD085 } from '@/lib/watchedTailsStore'
import { normalizeQuoteLinkChannel } from '@/domain/quoteLinkChannel'
import { dispatchAlertEmail } from '@/lib/dispatchNotify'
import { createEmailAdapter } from '@/adapters/email'

export type OperatorPacketInput = {
  invite_token?: string
  company_name: string
  base_icao: string
  email: string
  cell: string
  contact_name: string
  quote_pref: QuoteContactPref
  banking: OperatorBanking
  charter: File | null
  d085: File | null
  coi: File | null
}

export async function submitOperatorPacket(input: OperatorPacketInput) {
  const company = input.company_name.trim()
  const email = input.email.trim().toLowerCase()
  const cell = input.cell.trim()
  const channel = quotePrefToLinkChannel(input.quote_pref)

  let d085Rows: Array<{ tail: string; type_name: string }> = []
  let d085Note: string | undefined
  if (input.d085) {
    const parsed = await parseD085File(input.d085)
    d085Note = parsed.note
    d085Rows = parsed.rows
      .map((r) => ({
        tail: (r.tail ?? '').trim().toUpperCase(),
        type_name: (r.type_name ?? '').trim() || 'TBD',
      }))
      .filter((r) => r.tail)
  }

  const completeness = packetCompleteness({
    has_charter: Boolean(input.charter),
    has_d085: Boolean(input.d085),
    has_coi: Boolean(input.coi),
    has_email: email.includes('@'),
    has_cell: Boolean(cell),
    has_ach: Boolean(
      input.banking.ach_routing.trim() && input.banking.ach_account.trim(),
    ),
    has_wire: Boolean(
      input.banking.wire_routing.trim() && input.banking.wire_account.trim(),
    ),
    tail_count: d085Rows.length,
  })

  const bankingNote = [
    input.banking.ach_routing
      ? `ACH routing ${input.banking.ach_routing} acct ${input.banking.ach_account} (${input.banking.ach_account_type || 'checking'})`
      : null,
    input.banking.wire_bank_name || input.banking.wire_routing
      ? `Wire: ${input.banking.wire_bank_name || 'bank'} · ${input.banking.wire_beneficiary || company} · ABA ${input.banking.wire_routing} · acct ${input.banking.wire_account}${input.banking.wire_swift ? ` · SWIFT ${input.banking.wire_swift}` : ''}`
      : null,
    `Quote contact pref: ${input.quote_pref}`,
    d085Note ? `D085: ${d085Note}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const submission = submitOperatorOnboard({
    company_name: company,
    base_icao: input.base_icao.trim().toUpperCase(),
    company_phone: cell,
    after_hours_phone: cell,
    email,
    callout_min: null,
    primary_contact: {
      name: input.contact_name.trim() || 'Ops',
      email,
      phone: cell,
    },
    billing_contact: {
      name: input.contact_name.trim() || 'Billing',
      email,
      phone: cell,
    },
    capabilities: {
      pax: true,
      cargo: true,
      hazmat: false,
      medivac: false,
      ops_24hr: false,
      same_day: true,
    },
    argus: '',
    wyvern: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    bank_routing: input.banking.ach_routing.trim(),
    bank_account: input.banking.ach_account.trim(),
    notes: bankingNote,
    docs: {
      d085: input.d085?.name ?? null,
      coi: input.coi?.name ?? null,
      charter_cert: input.charter?.name ?? null,
    },
  })

  const draft = saveOperatorDraft({
    name: company,
    dba: '',
    certificate: '',
    base_icao: input.base_icao.trim().toUpperCase(),
    region: '',
    contacts: [
      {
        name: input.contact_name.trim() || 'Ops',
        role: 'ops',
        cell,
        email,
        consent_sms:
          input.quote_pref === 'text' || input.quote_pref === 'call',
        consent_call: input.quote_pref === 'call',
      },
    ],
    capabilities: {
      cargo: true,
      pax: true,
      hazmat: false,
      medivac: false,
      ops_24hr: false,
      callout_min: 60,
    },
    crew: {
      single_pilot_ok: true,
      dual_available: false,
      night_policy: 'Case-by-case',
    },
    aircraft: d085Rows.map((r) => ({
      tail: r.tail,
      type_name: r.type_name,
      liability_limit: '',
      hull_value: '',
      insurance_expiry: '',
    })),
    rates_note: `quote_pref=${input.quote_pref}; channel=${channel}`,
    completeness,
  })

  // Surface on Network board immediately (cache + draft merge).
  await loadNetwork()
  const opRow: OperatorRow = {
    id: draft.id,
    name: company,
    base_icao: draft.base_icao || null,
    needs_info: [],
    aircraft_count: d085Rows.length,
    contact_name: input.contact_name.trim() || null,
    contact_cell: cell || null,
    contact_email: email,
    ops_email: email,
    notes: bankingNote.slice(0, 500),
    quote_link_channel: normalizeQuoteLinkChannel(channel),
  }
  upsertCachedOperator(opRow)

  const compliance = ensureOperatorCompliance({
    operator_id: draft.id,
    operator_name: draft.name,
    contact_email: email,
  })
  if (input.d085) {
    await setOperatorDocFile(compliance.operator_id, 'd085', input.d085)
  }
  if (input.coi) {
    await setOperatorDocFile(compliance.operator_id, 'coi', input.coi)
  }
  if (input.charter) {
    await setOperatorDocFile(
      compliance.operator_id,
      'charter_cert',
      input.charter,
    )
  }

  if (d085Rows.length) {
    watchTailsFromD085({
      operator_id: draft.id,
      operator_name: company,
      base_icao: draft.base_icao,
      aircraft: d085Rows,
    })
  }

  for (const [kind, file] of [
    ['charter_cert', input.charter],
    ['d085', input.d085],
    ['coi', input.coi],
  ] as const) {
    if (!file) {
      addNeedsInfoTask({
        entity_type: 'operator',
        entity_id: draft.id,
        entity_label: company,
        field: kind,
        note: `Missing ${kind} on network packet`,
        wizard: 'operator',
      })
    }
  }
  addNeedsInfoTask({
    entity_type: 'operator',
    entity_id: draft.id,
    entity_label: company,
    field: 'packet_review',
    note: `Network packet ${submission.id.slice(0, 8)} — review docs, tails (${d085Rows.length}), banking, quote pref (${input.quote_pref})`,
    wizard: 'operator',
  })

  if (input.invite_token) {
    markInviteCompleted(input.invite_token, submission.id)
  }

  await persistPacketToDb({
    draftId: draft.id,
    company,
    base_icao: draft.base_icao,
    email,
    cell,
    contact_name: input.contact_name.trim() || 'Ops',
    channel,
    notes: bankingNote,
    tails: d085Rows,
  })

  // Desk alert so dispatch sees the packet even if DB write is off.
  try {
    const desk = dispatchAlertEmail()
    if (desk.includes('@')) {
      const tailsLine = d085Rows.length
        ? d085Rows.map((t) => t.tail).join(', ')
        : 'none parsed'
      await createEmailAdapter().send({
        to: desk,
        subject: `Network packet — ${company}`,
        text: [
          `${company} submitted a network packet.`,
          `Email: ${email}`,
          `Cell: ${cell || '—'}`,
          `Quote pref: ${input.quote_pref}`,
          `Base: ${draft.base_icao || '—'}`,
          `Tails: ${tailsLine}`,
          `Docs: charter=${input.charter?.name ?? '—'} d085=${input.d085?.name ?? '—'} coi=${input.coi?.name ?? '—'}`,
          '',
          bankingNote,
        ].join('\n'),
      })
    }
  } catch (e) {
    console.warn('[packet] desk alert failed', e)
  }

  return {
    submission,
    draft,
    tails: d085Rows,
    d085Note,
  }
}

async function persistPacketToDb(opts: {
  draftId: string
  company: string
  base_icao: string
  email: string
  cell: string
  contact_name: string
  channel: string
  notes: string
  tails: Array<{ tail: string; type_name: string }>
}): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  try {
    const { data: existing } = await supabase
      .from('operators')
      .select('id')
      .eq('name', opts.company)
      .maybeSingle()
    let operatorId = existing?.id as string | undefined
    if (!operatorId) {
      const { data: inserted, error } = await supabase
        .from('operators')
        .insert({
          id: opts.draftId,
          name: opts.company,
          base_icao: opts.base_icao || null,
          notes: opts.notes.slice(0, 2000),
          ops_email: opts.email,
          quote_link_channel: opts.channel,
          onboarding_status: 'packet_submitted',
        })
        .select('id')
        .single()
      if (error) {
        console.warn('[packet] operator insert failed', error.message)
        return
      }
      operatorId = inserted.id
    } else {
      await supabase
        .from('operators')
        .update({
          base_icao: opts.base_icao || null,
          notes: opts.notes.slice(0, 2000),
          ops_email: opts.email,
          quote_link_channel: opts.channel,
          onboarding_status: 'packet_submitted',
        })
        .eq('id', operatorId)
    }

    await supabase.from('operator_contacts').insert({
      operator_id: operatorId,
      name: opts.contact_name,
      role: 'ops',
      cell: opts.cell || null,
      email: opts.email,
      consent_sms: true,
      consent_call: opts.channel === 'both',
    })

    for (const t of opts.tails) {
      const { error } = await supabase.from('aircraft').upsert(
        {
          operator_id: operatorId,
          tail: t.tail,
          type_name: t.type_name || null,
          base_icao: opts.base_icao || null,
          active: true,
          spec_source: 'd085_packet',
        },
        { onConflict: 'operator_id,tail' },
      )
      if (error) console.warn('[packet] aircraft upsert failed', error.message)
    }
  } catch (e) {
    console.warn('[packet] persist to DB failed', e)
  }
}
