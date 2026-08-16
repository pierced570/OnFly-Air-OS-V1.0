/**
 * Import clients-export CSV into Supabase (upsert by name).
 *
 * Usage: npm run import:clients -- data/clients-export-2026-08-16.csv
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { profilesFromClientExportCsv } from '../src/domain/clientExportImport'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

async function main() {
  if (!url || !key) {
    console.error('Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }
  const file = resolve(
    process.cwd(),
    process.argv[2] || 'data/clients-export-2026-08-16.csv',
  )
  const profiles = profilesFromClientExportCsv(readFileSync(file, 'utf8'))
  const sb = createClient(url, key)

  let created = 0
  let updated = 0

  for (const p of profiles) {
    const { data: existing } = await sb
      .from('clients')
      .select('id,profile')
      .ilike('name', p.name)
      .maybeSingle()

    let clientId = existing?.id as string | undefined
    const mergedProfile = {
      ...((existing?.profile as object) ?? {}),
      ...p.profile,
    }

    if (!clientId) {
      const { data, error } = await sb
        .from('clients')
        .insert({
          name: p.name,
          billing_terms: p.pay_terms,
          notes: p.notes || null,
          invoice_email: p.invoice_email || null,
          po_prefix: p.po_prefix,
          legacy_key: p.legacy_key,
          profile: mergedProfile,
        })
        .select('id')
        .single()
      if (error) {
        console.error('INSERT', p.name, error.message)
        continue
      }
      clientId = data.id
      created++
    } else {
      const { error } = await sb
        .from('clients')
        .update({
          billing_terms: p.pay_terms,
          notes: p.notes || null,
          invoice_email: p.invoice_email || null,
          po_prefix: p.po_prefix ?? undefined,
          profile: mergedProfile,
        })
        .eq('id', clientId)
      if (error) {
        console.error('UPDATE', p.name, error.message)
        continue
      }
      updated++
    }

    await sb.from('client_contacts').delete().eq('client_id', clientId)
    if (p.contacts.length) {
      const { error } = await sb.from('client_contacts').insert(
        p.contacts.map((c: (typeof p.contacts)[number]) => ({
          client_id: clientId,
          name: c.name,
          role: c.role,
          email: c.email || null,
          cell: c.cell || null,
          kind: c.kind === 'dl' ? 'dl' : 'person',
          title: c.title ?? null,
          eta_icaos: c.eta_icaos ?? [],
          notify_prefs: c.notify_prefs,
        })),
      )
      if (error) console.error('CONTACTS', p.name, error.message)
    }

    await sb.from('client_rules').delete().eq('client_id', clientId)
    const { error: rulesErr } = await sb.from('client_rules').insert({
      client_id: clientId,
      dual_pilot_required: p.rules.dual_pilot_required,
      freight_only: p.rules.freight_only,
      multi_engine_only: p.rules.multi_engine_only,
      single_engine_turboprop_only: p.rules.single_engine_turboprop_only,
      no_single_engine_night: p.rules.no_single_engine_night,
      hazmat_allowed: p.rules.hazmat_allowed,
      max_declared_value: p.rules.declared_value_norm
        ? Number(String(p.rules.declared_value_norm).replace(/[^0-9.]/g, '')) ||
          null
        : null,
      other_rules: {
        list: p.rules.other_rules,
        hazmat_notes: p.rules.hazmat_notes || '',
        declared_value_norm: p.rules.declared_value_norm || '',
        exceptions_with_permission: p.rules.exceptions_with_permission,
      },
    })
    if (rulesErr) console.error('RULES', p.name, rulesErr.message)

    console.log(
      'OK',
      p.name,
      `· ${p.contacts.length} contacts · ${p.profile.bases?.length ?? 0} bases`,
    )
  }

  console.log(`Done. created=${created} updated=${updated} total=${profiles.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
