/**
 * ETA defaults store — Admin-editable; feeds buildTripChain.
 */

import {
  BUILTIN_ETA_DEFAULTS,
  type EtaDefaults,
} from '@/domain/etaChain'

const STORAGE_KEY = 'onfly.eta_defaults.v1'

let cached: EtaDefaults = { ...BUILTIN_ETA_DEFAULTS }
const listeners = new Set<() => void>()

function bump() {
  for (const l of listeners) l()
}

function loadLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<EtaDefaults>
    cached = { ...BUILTIN_ETA_DEFAULTS, ...parsed }
  } catch {
    /* ignore */
  }
}

function persistLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
  } catch {
    /* ignore */
  }
}

loadLocal()

export function subscribeEtaDefaults(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Snapshot for useSyncExternalStore — must return a stable reference when
 * data is unchanged (spreading every call causes infinite re-renders / React #185).
 */
export function getEtaDefaults(): EtaDefaults {
  return cached
}

export function setEtaDefault(
  key: keyof EtaDefaults,
  minutes: number,
): EtaDefaults {
  cached = { ...cached, [key]: Math.max(0, Math.round(minutes)) }
  persistLocal()
  bump()
  void flushEtaDefaultsToDb()
  return getEtaDefaults()
}

export function setEtaDefaults(patch: Partial<EtaDefaults>): EtaDefaults {
  cached = { ...cached, ...patch }
  persistLocal()
  bump()
  void flushEtaDefaultsToDb()
  return getEtaDefaults()
}

export function resetEtaDefaults(): EtaDefaults {
  cached = { ...BUILTIN_ETA_DEFAULTS }
  persistLocal()
  bump()
  void flushEtaDefaultsToDb()
  return getEtaDefaults()
}

async function flushEtaDefaultsToDb(): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    const rows = (Object.keys(cached) as (keyof EtaDefaults)[]).map((key) => ({
      key,
      minutes: cached[key],
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('eta_defaults').upsert(rows, { onConflict: 'key' })
  } catch (e) {
    console.warn('[eta_defaults] persist failed', e)
  }
}

export async function hydrateEtaDefaultsFromDb(): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    const { data, error } = await supabase.from('eta_defaults').select('key, minutes')
    if (error || !data?.length) return
    const next = { ...cached }
    for (const row of data) {
      const k = row.key as keyof EtaDefaults
      if (k in next && row.minutes != null) next[k] = Number(row.minutes)
    }
    cached = next
    persistLocal()
    bump()
  } catch (e) {
    console.warn('[eta_defaults] hydrate failed', e)
  }
}

export const ETA_DEFAULT_LABELS: Record<keyof EtaDefaults, string> = {
  driver_ttp: 'Driver time-to-position',
  driver_load: 'Loading at shipper',
  driver_unload: 'Unloading at consignee',
  fbo_transfer: 'Truck↔aircraft transfer',
  acft_ttp: 'Aircraft time-to-position',
  acft_turn: 'Aircraft turnaround',
  taxi_pad: 'Taxi pad (air legs)',
  slip_threshold: 'Slip alert threshold',
}
