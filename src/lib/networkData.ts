import type { AircraftRow, NetworkFixture, OperatorRow } from '@/lib/types'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { syncWatchedFromFleet } from '@/lib/watchedTailsStore'
import { typeSpecMap } from '@/domain/networkSheet'

export type { OperatorRow, AircraftRow }

export type NetworkLoadSource = 'live' | 'fixture'

export type LoadedNetwork = NetworkFixture & { source: NetworkLoadSource }

let cached: LoadedNetwork | null = null
const listeners = new Set<() => void>()

function bump() {
  for (const l of listeners) l()
}

export function subscribeNetworkCache(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getCachedNetwork(): LoadedNetwork | null {
  return cached
}

export function invalidateNetworkCache(): void {
  cached = null
  bump()
}

/** Patch in-memory fleet after sheet edits (keeps one spine for routing). */
export function patchCachedAircraft(
  aircraftId: string,
  patch: Partial<AircraftRow>,
): void {
  if (!cached) return
  const i = cached.aircraft.findIndex((a) => a.id === aircraftId)
  if (i < 0) return
  cached.aircraft[i] = { ...cached.aircraft[i], ...patch }
  bump()
}

export function patchCachedOperator(
  operatorId: string,
  patch: Partial<OperatorRow>,
): void {
  if (!cached) return
  const i = cached.operators.findIndex((o) => o.id === operatorId)
  if (i < 0) return
  cached.operators[i] = { ...cached.operators[i], ...patch }
  for (const a of cached.aircraft) {
    if (a.operator_id !== operatorId) continue
    if (patch.name) a.operator_name = patch.name
  }
  bump()
}

function enrichAircraftFromSpecs(
  aircraft: AircraftRow[],
  type_specs: Array<Record<string, unknown>>,
): AircraftRow[] {
  const specs = typeSpecMap(type_specs)
  return aircraft.map((a) => {
    const spec = a.type_name ? specs.get(a.type_name) : undefined
    if (!spec) return a
    // Do not copy door/cabin onto the row — sheet merge keeps type-library
    // provenance (gold defaults). Routing joins type_specs separately.
    return {
      ...a,
      range_nm: a.range_nm ?? spec.range_nm ?? null,
      cruise_kts: a.cruise_kts ?? spec.cruise_kts ?? null,
      mtow_lbs: a.mtow_lbs ?? spec.mtow_lbs ?? null,
      max_payload_lbs: a.max_payload_lbs ?? spec.max_payload_lbs ?? null,
      seats: a.seats ?? spec.seats ?? null,
    }
  })
}

export async function loadNetwork(): Promise<LoadedNetwork> {
  if (cached) return cached

  if (isSupabaseConfigured && supabase) {
    const [
      { data: operators, error: oErr },
      { data: aircraft, error: aErr },
      { data: specs, error: sErr },
      { data: contacts, error: cErr },
    ] = await Promise.all([
      supabase
        .from('operators')
        .select('id,name,base_icao,needs_info,ops_email,notes'),
      supabase
        .from('aircraft')
        .select(
          'id,operator_id,tail,type_name,category,engines,cargo_pax,base_icao,cruise_kts,range_nm,mtow_lbs,max_payload_lbs,seats,door_type,door_w_in,door_h_in,cabin_l_ft,cabin_w_ft,cabin_h_ft,cabin_vol_cuft,needs_info,active,operators(name)',
        ),
      supabase.from('type_specs').select('*'),
      supabase
        .from('operator_contacts')
        .select('operator_id,name,role,cell,email')
        .order('created_at', { ascending: true }),
    ])
    // Only use live DB when it actually has fleet rows — empty project
    // must fall through to the bundled fixture or intake/quote recommend nothing.
    if (!oErr && !aErr && operators && aircraft && aircraft.length > 0) {
      const contactByOp = new Map<
        string,
        { name: string | null; cell: string | null; email: string | null }
      >()
      if (!cErr && contacts) {
        for (const c of contacts) {
          const oid = c.operator_id as string
          if (contactByOp.has(oid)) continue
          contactByOp.set(oid, {
            name: (c.name as string | null) ?? null,
            cell: (c.cell as string | null) ?? null,
            email: (c.email as string | null) ?? null,
          })
        }
      }

      const ops: OperatorRow[] = operators.map((o) => {
        const ct = contactByOp.get(o.id as string)
        return {
          id: o.id as string,
          name: o.name as string,
          base_icao: (o.base_icao as string | null) ?? null,
          needs_info: (o.needs_info as OperatorRow['needs_info']) ?? [],
          aircraft_count: aircraft.filter((a) => a.operator_id === o.id).length,
          contact_name: ct?.name ?? null,
          contact_cell: ct?.cell ?? null,
          contact_email: ct?.email ?? null,
          ops_email: (o.ops_email as string | null) ?? null,
          notes: (o.notes as string | null) ?? null,
        }
      })
      let acs: AircraftRow[] = aircraft.map((a) => {
        const opRel = a.operators as unknown as { name: string } | null
        return {
          id: a.id as string,
          operator_id: a.operator_id as string,
          operator_name: opRel?.name ?? '',
          tail: a.tail as string,
          type_name: (a.type_name as string | null) ?? null,
          category: (a.category as string | null) ?? null,
          engines: (a.engines as string | null) ?? null,
          cargo_pax: (a.cargo_pax as string | null) ?? null,
          base_icao: (a.base_icao as string | null) ?? null,
          cruise_kts: (a.cruise_kts as number | null) ?? null,
          range_nm: (a.range_nm as number | null) ?? null,
          mtow_lbs: (a.mtow_lbs as number | null) ?? null,
          max_payload_lbs: (a.max_payload_lbs as number | null) ?? null,
          seats: (a.seats as number | null) ?? null,
          door_type: (a.door_type as string | null) ?? null,
          door_w_in: (a.door_w_in as number | null) ?? null,
          door_h_in: (a.door_h_in as number | null) ?? null,
          cabin_l_ft: (a.cabin_l_ft as number | null) ?? null,
          cabin_w_ft: (a.cabin_w_ft as number | null) ?? null,
          cabin_h_ft: (a.cabin_h_ft as number | null) ?? null,
          cabin_vol_cuft: (a.cabin_vol_cuft as number | null) ?? null,
          fet_applies: null,
          needs_info: (a.needs_info as AircraftRow['needs_info']) ?? [],
          active: Boolean(a.active),
        }
      })
      const typeSpecs = (!sErr && specs ? specs : []) as Array<
        Record<string, unknown>
      >
      acs = enrichAircraftFromSpecs(acs, typeSpecs)
      cached = {
        importedAt: new Date().toISOString(),
        operators: ops,
        aircraft: acs,
        airports: [],
        type_specs: typeSpecs,
        counts: {
          operators: ops.length,
          aircraft: acs.length,
          airports: 0,
          needs_info_tasks: acs.reduce((n, a) => n + a.needs_info.length, 0),
        },
        source: 'live',
      }
      syncWatchedFromFleet(acs)
      bump()
      return cached
    }
  }

  // Lazy-load fixture only when DB is empty / unavailable (~400KB)
  const mod = await import('@/fixtures/network.json')
  const fixture = mod.default as NetworkFixture
  const enriched = enrichAircraftFromSpecs(
    fixture.aircraft,
    fixture.type_specs ?? [],
  )
  cached = {
    ...fixture,
    aircraft: enriched,
    source: 'fixture',
  }
  syncWatchedFromFleet(enriched)
  bump()
  return cached
}
