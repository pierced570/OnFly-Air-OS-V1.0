import type { AircraftRow, NetworkFixture, OperatorRow } from '@/lib/types'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { syncWatchedFromFleet } from '@/lib/watchedTailsStore'

export type { OperatorRow, AircraftRow }

export type NetworkLoadSource = 'live' | 'fixture'

export type LoadedNetwork = NetworkFixture & { source: NetworkLoadSource }

let cached: LoadedNetwork | null = null

async function loadFixtureNetwork(): Promise<NetworkFixture> {
  const mod = await import('@/fixtures/network.json')
  return mod.default as NetworkFixture
}

/**
 * Live `aircraft` has no $/NM columns — overlay history/assumed rates (and
 * missing door/range/cargo_pax) from the fleet CSV fixture by tail.
 */
function mergeFixtureFleetFields(
  live: AircraftRow[],
  fixture: NetworkFixture,
): AircraftRow[] {
  const byTail = new Map(fixture.aircraft.map((a) => [a.tail, a]))
  return live.map((a) => {
    const f = byTail.get(a.tail)
    if (!f) return a
    return {
      ...a,
      cargo_pax: a.cargo_pax ?? f.cargo_pax,
      range_nm: a.range_nm ?? f.range_nm,
      door_w_in: a.door_w_in ?? f.door_w_in,
      door_h_in: a.door_h_in ?? f.door_h_in,
      avg_op_per_nm_circuit: f.avg_op_per_nm_circuit,
      med_assumed_op_per_nm: f.med_assumed_op_per_nm,
      rate_source: f.rate_source,
      fet_applies: a.fet_applies ?? f.fet_applies,
    }
  })
}

export async function loadNetwork(): Promise<LoadedNetwork> {
  if (cached) return cached

  if (isSupabaseConfigured && supabase) {
    const [
      { data: operators, error: oErr },
      { data: aircraft, error: aErr },
      { data: typeSpecs, error: tErr },
    ] = await Promise.all([
      supabase.from('operators').select('id,name,base_icao,needs_info'),
      supabase
        .from('aircraft')
        .select(
          'id,operator_id,tail,type_name,category,engines,cargo_pax,base_icao,cruise_kts,range_nm,mtow_lbs,max_payload_lbs,seats,door_w_in,door_h_in,needs_info,active,operators(name)',
        ),
      supabase.from('type_specs').select('*'),
    ])
    // Only use live DB when it actually has fleet rows — empty project
    // must fall through to the bundled fixture or intake/quote recommend nothing.
    if (!oErr && !aErr && operators && aircraft && aircraft.length > 0) {
      const fixture = await loadFixtureNetwork()
      const ops: OperatorRow[] = operators.map((o) => ({
        id: o.id as string,
        name: o.name as string,
        base_icao: (o.base_icao as string | null) ?? null,
        needs_info: (o.needs_info as OperatorRow['needs_info']) ?? [],
        aircraft_count: aircraft.filter((a) => a.operator_id === o.id).length,
      }))
      const acs: AircraftRow[] = mergeFixtureFleetFields(
        aircraft.map((a) => {
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
            door_w_in:
              a.door_w_in == null ? null : Number(a.door_w_in as number),
            door_h_in:
              a.door_h_in == null ? null : Number(a.door_h_in as number),
            avg_op_per_nm_circuit: null,
            med_assumed_op_per_nm: null,
            rate_source: null,
            fet_applies: null,
            needs_info: (a.needs_info as AircraftRow['needs_info']) ?? [],
            active: Boolean(a.active),
          }
        }),
        fixture,
      )
      let type_specs: Array<Record<string, unknown>> =
        !tErr && Array.isArray(typeSpecs) && typeSpecs.length > 0
          ? (typeSpecs as Array<Record<string, unknown>>)
          : []
      if (type_specs.length === 0) {
        type_specs = fixture.type_specs ?? []
      }
      cached = {
        importedAt: new Date().toISOString(),
        operators: ops,
        aircraft: acs,
        airports: [],
        type_specs,
        counts: {
          operators: ops.length,
          aircraft: acs.length,
          airports: 0,
          needs_info_tasks: acs.reduce((n, a) => n + a.needs_info.length, 0),
        },
        source: 'live',
      }
      syncWatchedFromFleet(acs)
      return cached
    }
  }

  // Lazy-load fixture only when DB is empty / unavailable (~400KB)
  const fixture = await loadFixtureNetwork()
  cached = { ...fixture, source: 'fixture' }
  syncWatchedFromFleet(fixture.aircraft)
  return cached
}

export function __resetNetworkCacheForTests(): void {
  cached = null
}
