import type { AircraftRow, NetworkFixture, OperatorRow } from '@/lib/types'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { syncWatchedFromFleet } from '@/lib/watchedTailsStore'

export type { OperatorRow, AircraftRow }

export type NetworkLoadSource = 'live' | 'fixture'

export type LoadedNetwork = NetworkFixture & { source: NetworkLoadSource }

let cached: LoadedNetwork | null = null

export async function loadNetwork(): Promise<LoadedNetwork> {
  if (cached) return cached

  if (isSupabaseConfigured && supabase) {
    const [{ data: operators, error: oErr }, { data: aircraft, error: aErr }] =
      await Promise.all([
        supabase.from('operators').select('id,name,base_icao,needs_info'),
        supabase
          .from('aircraft')
          .select(
            'id,operator_id,tail,type_name,category,engines,base_icao,cruise_kts,mtow_lbs,max_payload_lbs,seats,needs_info,active,operators(name)',
          ),
      ])
    // Only use live DB when it actually has fleet rows — empty project
    // must fall through to the bundled fixture or intake/quote recommend nothing.
    if (!oErr && !aErr && operators && aircraft && aircraft.length > 0) {
      const ops: OperatorRow[] = operators.map((o) => ({
        id: o.id as string,
        name: o.name as string,
        base_icao: (o.base_icao as string | null) ?? null,
        needs_info: (o.needs_info as OperatorRow['needs_info']) ?? [],
        aircraft_count: aircraft.filter((a) => a.operator_id === o.id).length,
      }))
      const acs: AircraftRow[] = aircraft.map((a) => {
        const opRel = a.operators as unknown as { name: string } | null
        return {
          id: a.id as string,
          operator_id: a.operator_id as string,
          operator_name: opRel?.name ?? '',
          tail: a.tail as string,
          type_name: (a.type_name as string | null) ?? null,
          category: (a.category as string | null) ?? null,
          engines: (a.engines as string | null) ?? null,
          base_icao: (a.base_icao as string | null) ?? null,
          cruise_kts: (a.cruise_kts as number | null) ?? null,
          mtow_lbs: (a.mtow_lbs as number | null) ?? null,
          max_payload_lbs: (a.max_payload_lbs as number | null) ?? null,
          seats: (a.seats as number | null) ?? null,
          fet_applies: null,
          needs_info: (a.needs_info as AircraftRow['needs_info']) ?? [],
          active: Boolean(a.active),
        }
      })
      cached = {
        importedAt: new Date().toISOString(),
        operators: ops,
        aircraft: acs,
        airports: [],
        type_specs: [],
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
  const mod = await import('@/fixtures/network.json')
  const fixture = mod.default as NetworkFixture
  cached = { ...fixture, source: 'fixture' }
  syncWatchedFromFleet(fixture.aircraft)
  return cached
}
