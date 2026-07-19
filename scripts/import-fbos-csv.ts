/**
 * Import FBOs from CSV into Supabase (+ prints session-ready JSON).
 *
 * Usage: npx tsx scripts/import-fbos-csv.ts data/fbos_template.csv
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: resolve(process.cwd(), '.env') })

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL / keys in .env')
  process.exit(1)
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const header = lines.shift()?.split(',').map((h) => h.trim()) ?? []
  return lines.map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = cols[i] ?? ''
    })
    return row
  })
}

function truthy(v: string): boolean {
  return /^(1|true|yes|y)$/i.test(v)
}

async function main() {
  const file = resolve(process.cwd(), process.argv[2] || 'data/fbos_template.csv')
  const rows = parseCsv(readFileSync(file, 'utf8'))
  const sb = createClient(url!, key!)

  for (const r of rows) {
    const icao = (r.airport_icao || '').toUpperCase()
    if (!icao || !r.name) continue
    await sb.from('airports').upsert(
      {
        icao,
        name: icao,
        city: r.city || null,
        state: r.state || null,
      },
      { onConflict: 'icao' },
    )
    const { error } = await sb.from('fbos').insert({
      icao,
      name: r.name,
      street: r.street || null,
      city: r.city || null,
      state: r.state || null,
      zip: r.zip || null,
      phone: r.phone || null,
      after_hours_phone: r.after_hours_phone || null,
      is_24hr: truthy(r.is_24hr || ''),
      forklift: truthy(r.forklift || ''),
      forklift_capacity_lbs: r.forklift_capacity_lbs
        ? Number(r.forklift_capacity_lbs)
        : null,
      gl_insurance: truthy(r.gl_insurance || ''),
      handling_fee: r.handling_fee ? Number(r.handling_fee) : null,
      callout_fee: r.callout_fee ? Number(r.callout_fee) : null,
      fees_waived_with_fuel: truthy(r.fees_waived_with_fuel || ''),
      notes: r.notes || null,
      last_verified: new Date().toISOString().slice(0, 10),
      needs_info: [],
    })
    if (error) console.error(icao, r.name, error.message)
    else console.log('OK', icao, r.name)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
