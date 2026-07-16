/**
 * Seed Demo Freight Co via service role (REST) when DB migrate isn't used.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const sb = createClient(url, key)

  let { data: existing } = await sb
    .from('clients')
    .select('id')
    .eq('name', 'Demo Freight Co')
    .maybeSingle()

  let clientId = existing?.id as string | undefined
  if (!clientId) {
    const { data, error } = await sb
      .from('clients')
      .insert({
        name: 'Demo Freight Co',
        billing_terms: 'NET30',
        notes: 'Seeded demo client for portal + intake.',
      })
      .select('id')
      .single()
    if (error) throw error
    clientId = data.id
  }

  const contacts = [
    {
      name: 'Alex Requester',
      role: 'requester',
      email: 'requester@demo-freight.test',
      cell: '+15551234567',
      notify_prefs: { wheels_up: true, wheels_down: true, pod: true },
    },
    {
      name: 'Blake AP',
      role: 'ap',
      email: 'ap@demo-freight.test',
      cell: '+15551234568',
      notify_prefs: { invoice: true },
    },
    {
      name: 'Casey Supply',
      role: 'supply_chain',
      email: 'supply@demo-freight.test',
      cell: '+15551234569',
      notify_prefs: { tracker: true, wheels_up: true, pod: true },
    },
  ]

  for (const c of contacts) {
    const { data: hit } = await sb
      .from('client_contacts')
      .select('id')
      .eq('client_id', clientId)
      .eq('email', c.email)
      .maybeSingle()
    if (!hit) {
      const { error } = await sb.from('client_contacts').insert({
        client_id: clientId,
        ...c,
      })
      if (error) throw error
    }
  }

  const { data: rules } = await sb
    .from('client_rules')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!rules) {
    const { error } = await sb.from('client_rules').insert({
      client_id: clientId,
      dual_pilot_required: false,
      freight_only: true,
      multi_engine_only: false,
      hazmat_allowed: true,
      max_declared_value: 500000,
    })
    if (error) throw error
  }

  console.log('Demo Freight Co seeded:', clientId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
