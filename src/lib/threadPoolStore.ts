/**
 * Thread number pool — assign on create_thread, release on disband (+24h grace).
 */

import {
  pickThreadNumber,
  THREAD_RELEASE_GRACE_HOURS,
} from '@/domain/tripThread'

export type ThreadNumberRow = {
  number: string
  purpose: string
  active: boolean
  trip_id: string | null
  assigned_at: string | null
  release_after: string | null
}

const STORAGE_KEY = 'onfly.thread_numbers.v1'

const SEED: ThreadNumberRow[] = [
  {
    number: '+15557100001',
    purpose: 'trip_thread',
    active: true,
    trip_id: null,
    assigned_at: null,
    release_after: null,
  },
  {
    number: '+15557100002',
    purpose: 'trip_thread',
    active: true,
    trip_id: null,
    assigned_at: null,
    release_after: null,
  },
  {
    number: '+15557100003',
    purpose: 'trip_thread',
    active: true,
    trip_id: null,
    assigned_at: null,
    release_after: null,
  },
  {
    number: '+15557100004',
    purpose: 'trip_thread',
    active: true,
    trip_id: null,
    assigned_at: null,
    release_after: null,
  },
  {
    number: '+15557100005',
    purpose: 'trip_thread',
    active: true,
    trip_id: null,
    assigned_at: null,
    release_after: null,
  },
]

let pool: ThreadNumberRow[] = SEED.map((r) => ({ ...r }))

function load(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as ThreadNumberRow[]
    if (Array.isArray(parsed) && parsed.length) pool = parsed
  } catch {
    /* ignore */
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pool))
  } catch {
    /* ignore */
  }
}

load()

export function listThreadNumbers(): ThreadNumberRow[] {
  return pool.map((r) => ({ ...r }))
}

export function assignThreadNumber(opts: {
  tripId: string
  candidateCells: string[]
  activeTrips: Array<{ id: string; thread_number: string | null; cells: string[] }>
}): string | null {
  // Reclaim expired grace holds
  const now = Date.now()
  for (const row of pool) {
    if (
      row.release_after &&
      Date.parse(row.release_after) <= now &&
      !row.trip_id
    ) {
      row.release_after = null
    }
  }

  const available = pool.map((r) => ({
    number: r.number,
    active: r.active && !r.trip_id && !r.release_after,
    trip_id: r.trip_id,
  }))

  const picked = pickThreadNumber(available, {
    candidateCells: opts.candidateCells,
    activeTrips: opts.activeTrips,
  })
  if (!picked) return null

  const row = pool.find((r) => r.number === picked)!
  row.trip_id = opts.tripId
  row.assigned_at = new Date().toISOString()
  row.release_after = null
  persist()
  void flushPoolToDb()
  return picked
}

export function releaseThreadNumber(
  tripId: string,
  opts?: { graceHours?: number },
): void {
  const grace = opts?.graceHours ?? THREAD_RELEASE_GRACE_HOURS
  const row = pool.find((r) => r.trip_id === tripId)
  if (!row) return
  row.trip_id = null
  row.assigned_at = null
  row.release_after = new Date(
    Date.now() + grace * 3600_000,
  ).toISOString()
  persist()
  void flushPoolToDb()
}

async function flushPoolToDb(): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    for (const row of pool) {
      await supabase.from('thread_numbers').upsert(
        {
          number: row.number,
          purpose: row.purpose,
          active: row.active,
          trip_id: row.trip_id,
          assigned_at: row.assigned_at,
          release_after: row.release_after,
        },
        { onConflict: 'number' },
      )
    }
  } catch (e) {
    console.warn('[thread_numbers] persist failed', e)
  }
}
