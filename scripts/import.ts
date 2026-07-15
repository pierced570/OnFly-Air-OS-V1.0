/**
 * Fleet CSV importer.
 * - Always writes fixtures for offline UI/demo
 * - When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, upserts into DB
 *
 * Usage:
 *   npm run import:fleet:fixtures
 *   npm run import:fleet
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildTypeSpecs, parseFleetCsv, type FleetParseResult } from '../src/domain/fleetParser'
import { AIRPORTS, lookupAirport } from '../src/domain/airports'
import type { NetworkFixture } from '../src/lib/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CSV_PATH = resolve(ROOT, 'data/OnFly_Aircraft_Master_Flat.csv')
const FIXTURES_DIR = resolve(ROOT, 'src/fixtures')
const GENERATED_DIR = resolve(ROOT, 'data/generated')

export type { NetworkFixture }

function slugId(prefix: string, key: string): string {
  // Deterministic UUID-ish hex from key for idempotent fixtures
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  const hex = Math.abs(h).toString(16).padStart(8, '0')
  return `${hex.slice(0, 8)}-${prefix}-4000-8000-${hex.padEnd(12, '0').slice(0, 12)}`
}

export function buildNetworkFixture(parsed: FleetParseResult): NetworkFixture {
  const type_specs = buildTypeSpecs(parsed.aircraft)
  const opIds = new Map<string, string>()
  const operators = parsed.operators.map((name) => {
    const id = slugId('aaaa', name)
    opIds.set(name, id)
    const acs = parsed.aircraft.filter((a) => a.operator === name)
    const bases = [...new Set(acs.map((a) => a.base_icao).filter(Boolean))] as string[]
    const needs = new Map<string, { field: string; note: string }>()
    for (const a of acs) {
      for (const n of a.needs_info) needs.set(`${n.field}:${n.note}`, n)
    }
    return {
      id,
      name,
      base_icao: bases[0] ?? null,
      needs_info: [...needs.values()],
      aircraft_count: acs.length,
    }
  })

  const aircraft = parsed.aircraft.map((a) => {
    const operator_id = opIds.get(a.operator)!
    return {
      id: slugId('bbbb', `${a.operator}|${a.tail}`),
      operator_id,
      operator_name: a.operator,
      tail: a.tail,
      type_name: a.type_name,
      category: a.category,
      engines: a.engines,
      base_icao: a.base_icao,
      cruise_kts: a.cruise_kts,
      mtow_lbs: a.mtow_lbs,
      max_payload_lbs: a.max_payload_lbs,
      seats: a.seats,
      fet_applies: a.fet_applies,
      needs_info: a.needs_info,
      active: true,
    }
  })

  const airports = parsed.icaos.map((icao) => {
    const info = lookupAirport(icao) ?? AIRPORTS[icao]
    if (info) return info
    return {
      icao,
      name: icao,
      lat: 0,
      lon: 0,
      tz: 'UTC',
    }
  })

  return {
    importedAt: new Date().toISOString(),
    operators,
    aircraft,
    airports,
    type_specs,
    counts: {
      operators: operators.length,
      aircraft: aircraft.length,
      airports: airports.length,
      needs_info_tasks: parsed.needsInfoTasks.length,
    },
  }
}

export function writeFixtures(fixture: NetworkFixture) {
  mkdirSync(FIXTURES_DIR, { recursive: true })
  mkdirSync(GENERATED_DIR, { recursive: true })
  writeFileSync(resolve(FIXTURES_DIR, 'network.json'), JSON.stringify(fixture, null, 2))
  writeFileSync(
    resolve(GENERATED_DIR, 'import_counts.json'),
    JSON.stringify(fixture.counts, null, 2),
  )
}

async function upsertToSupabase(client: SupabaseClient, fixture: NetworkFixture) {
  // Upsert operators by name
  for (const op of fixture.operators) {
    const { error } = await client.from('operators').upsert(
      {
        name: op.name,
        base_icao: op.base_icao,
        needs_info: op.needs_info,
      },
      { onConflict: 'name' },
    )
    if (error) throw error
  }

  const { data: ops, error: opsErr } = await client.from('operators').select('id,name')
  if (opsErr) throw opsErr
  const nameToId = new Map((ops ?? []).map((o: { id: string; name: string }) => [o.name, o.id]))

  for (const ap of fixture.airports) {
    const { error } = await client.from('airports').upsert(ap, { onConflict: 'icao' })
    if (error) throw error
  }

  for (const ts of fixture.type_specs) {
    const { error } = await client.from('type_specs').upsert(ts, { onConflict: 'type_name' })
    if (error) throw error
  }

  for (const ac of fixture.aircraft) {
    const operator_id = nameToId.get(ac.operator_name)
    if (!operator_id) continue
    const { error } = await client.from('aircraft').upsert(
      {
        operator_id,
        tail: ac.tail,
        type_name: ac.type_name,
        category: ac.category,
        engines: ac.engines,
        seats: ac.seats,
        base_icao: ac.base_icao,
        cruise_kts: ac.cruise_kts,
        mtow_lbs: ac.mtow_lbs,
        max_payload_lbs: ac.max_payload_lbs,
        needs_info: ac.needs_info,
        active: true,
      },
      { onConflict: 'operator_id,tail' },
    )
    if (error) throw error
  }
}

export function runImport(csvText: string) {
  const parsed = parseFleetCsv(csvText)
  const fixture = buildNetworkFixture(parsed)
  return { parsed, fixture }
}

async function main() {
  const fixturesOnly = process.argv.includes('--fixtures-only')
  const csvText = readFileSync(CSV_PATH, 'utf8')
  const { fixture } = runImport(csvText)
  writeFixtures(fixture)
  console.log('Wrote fixtures:', fixture.counts)

  if (fixturesOnly) return

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('No Supabase credentials — fixtures only (pass env to upsert).')
    return
  }
  const client = createClient(url, key)
  await upsertToSupabase(client, fixture)
  console.log('Upserted into Supabase.')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
