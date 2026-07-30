/**
 * Checkpoint schedule for dispatched trips — client-side ticker until edge cron.
 * On fire → Board exception + trip_event (no auto SMS — desk works the queue).
 */

import {
  dueCheckpoints,
  planCheckpoints,
  type PlannedCheckpoint,
} from '@/domain/checkpoints'
import { raiseException } from '@/lib/exceptionStore'
import {
  getTrip,
  listTripsStable,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'
import { computeEtaSheetFromBookedTrip } from '@/lib/etaSheet'

export type ScheduledCheckpoint = PlannedCheckpoint & {
  id: string
  trip_id: string
  trip_ref: number
  status: 'scheduled' | 'fired' | 'acked' | 'cancelled'
  fired_at: string | null
  exception_id: string | null
}

const byTrip = new Map<string, ScheduledCheckpoint[]>()
const listeners = new Set<() => void>()
/** Stable snapshots for useSyncExternalStore — never allocate on read. */
let snapshot: ScheduledCheckpoint[] = []
let upcomingSnapshot: ScheduledCheckpoint[] = []
let ticker: ReturnType<typeof setInterval> | null = null

function rebuild() {
  snapshot = [...byTrip.values()]
    .flat()
    .filter((c) => c.status === 'scheduled' || c.status === 'fired')
    .sort((a, b) => a.fire_at.localeCompare(b.fire_at))
  const now = Date.now()
  upcomingSnapshot = snapshot
    .filter(
      (c) =>
        c.status === 'scheduled' &&
        new Date(c.fire_at).getTime() >= now - 60_000,
    )
    .slice(0, 12)
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeCheckpoints(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listCheckpoints(): ScheduledCheckpoint[] {
  return snapshot
}

/**
 * Stable upcoming list (capped at 12 on rebuild).
 * Safe as useSyncExternalStore getSnapshot — do not .slice() here.
 */
export function listUpcomingCheckpoints(_limit = 12): ScheduledCheckpoint[] {
  return upcomingSnapshot
}

export function listFiredOpenCheckpoints(): ScheduledCheckpoint[] {
  return snapshot.filter((c) => c.status === 'fired')
}

/** Fill null est_* on legs from ETA sheet / offer times so timers have anchors. */
export function hydrateLegEstimates(trip: TripStoreRow, now = new Date()): void {
  const sheet = computeEtaSheetFromBookedTrip(trip, now)
  if (!sheet?.lines.length) {
    // ASAP fallback: stagger from now
    let cursor = now.getTime()
    mutateTrip(trip.id, (t) => {
      for (const leg of t.legs) {
        if (leg.est_start && leg.est_end) continue
        const start = new Date(cursor)
        const end = new Date(cursor + 60 * 60_000)
        leg.est_start = start.toISOString()
        leg.est_end = end.toISOString()
        cursor += 75 * 60_000
      }
    })
    return
  }

  mutateTrip(trip.id, (t) => {
    // Map sheet lines onto air_leg / position pairs when possible
    const airLegs = t.legs.filter(
      (l) => l.type === 'air_leg' || l.type === 'position',
    )
    for (const [i, line] of sheet.lines.entries()) {
      const pickup = zuluTodayToIso(line.pickup_time_zulu, now)
      const depart = zuluTodayToIso(line.depart_time_zulu, now)
      const arrive = zuluTodayToIso(line.arrive_time_zulu, now)
      const pos = airLegs[i * 2]
      const air = airLegs[i * 2 + 1] ?? airLegs[i]
      if (pos && pos.type === 'position') {
        if (!pos.est_start) pos.est_start = pickup
        if (!pos.est_end) pos.est_end = depart
      }
      if (air) {
        if (!air.est_start) air.est_start = depart
        if (!air.est_end) air.est_end = arrive
      }
    }
    // Offload / POD after last arrive
    const lastArrive = sheet.lines.at(-1)
    const off = t.legs.find((l) => l.type === 'offload')
    if (off && lastArrive) {
      const arrive = zuluTodayToIso(lastArrive.arrive_time_zulu, now)
      if (!off.est_start) off.est_start = arrive
      if (!off.est_end) {
        off.est_end = new Date(
          new Date(arrive).getTime() + 30 * 60_000,
        ).toISOString()
      }
    }
  })
}

function zuluTodayToIso(zulu: string, now: Date): string {
  // "14:30Z" → today UTC at that time (or tomorrow if already past for ASAP)
  const m = zulu.match(/(\d{1,2}):(\d{2})/)
  if (!m) return now.toISOString()
  const d = new Date(now)
  d.setUTCHours(Number(m[1]), Number(m[2]), 0, 0)
  if (d.getTime() < now.getTime() - 5 * 60_000) {
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d.toISOString()
}

/**
 * Schedule checkpoints when a trip is dispatched (booked / QD).
 * Replaces any prior schedule for the trip.
 */
export function scheduleCheckpointsForTrip(tripId: string): ScheduledCheckpoint[] {
  const trip = getTrip(tripId)
  if (!trip) return []

  hydrateLegEstimates(trip)
  const fresh = getTrip(tripId)!
  const planned = planCheckpoints(fresh.legs)
  const rows: ScheduledCheckpoint[] = planned.map((p) => ({
    ...p,
    id: crypto.randomUUID(),
    trip_id: tripId,
    trip_ref: fresh.ref,
    status: 'scheduled',
    fired_at: null,
    exception_id: null,
  }))
  byTrip.set(tripId, rows)

  mutateTrip(tripId, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'checkpoints_scheduled',
      payload: {
        count: rows.length,
        next: rows[0]
          ? { kind: rows[0].kind, fire_at: rows[0].fire_at }
          : null,
      },
    })
  })

  void persistCheckpoints(tripId, rows)

  bump()
  // Fire anything already due (ASAP / past T-minus) — edge cron mirrors this
  void tickCheckpoints()
  return rows
}

async function persistCheckpoints(
  tripId: string,
  rows: ScheduledCheckpoint[],
): Promise<void> {
  try {
    const { canPersist, db, safeQuery } = await import('@/lib/db/client')
    const { ensureTripRow, persistLegs } = await import('@/lib/db/persistTrip')
    if (!canPersist()) return
    const trip = getTrip(tripId)
    if (trip) {
      await ensureTripRow(trip)
      await persistLegs(tripId, trip.legs)
    }
    await safeQuery('checkpoints.delete', () =>
      db().from('checkpoints').delete().eq('trip_id', tripId),
    )
    if (!rows.length) return
    await safeQuery('checkpoints.insert', () =>
      db().from('checkpoints').insert(
        rows.map((r) => ({
          id: r.id,
          trip_id: tripId,
          leg_id: r.leg_id || null,
          key: r.key,
          kind: r.kind,
          fire_at: r.fire_at,
          status: r.status,
          title: r.title ?? r.kind,
          detail: r.detail ?? '',
        })),
      ),
    )
  } catch (e) {
    console.warn('[checkpoints] persist failed', e)
  }
}

export function cancelCheckpointsForTrip(tripId: string): void {
  const rows = byTrip.get(tripId)
  if (!rows) return
  for (const r of rows) {
    if (r.status === 'scheduled') r.status = 'cancelled'
  }
  bump()
}

export function acknowledgeCheckpoint(id: string): void {
  for (const rows of byTrip.values()) {
    const hit = rows.find((r) => r.id === id)
    if (hit) {
      hit.status = 'acked'
      bump()
      return
    }
  }
}

/** Fire due checkpoints → Board exception queue (no auto SMS). */
export async function tickCheckpoints(now = new Date()): Promise<number> {
  const nowIso = now.toISOString()
  let fired = 0

  for (const [tripId, rows] of byTrip) {
    const trip = getTrip(tripId)
    if (!trip) continue
    if (
      trip.state === 'delivered' ||
      trip.state === 'closed' ||
      trip.state === 'cancelled' ||
      trip.state === 'invoiced'
    ) {
      cancelCheckpointsForTrip(tripId)
      continue
    }

    // Refresh overdue plans if leg actuals landed
    const firedKeys = new Set(
      rows.filter((r) => r.status !== 'scheduled').map((r) => r.key),
    )
    // Drop overdue if leg now has actual_end
    for (const r of rows) {
      if (r.status !== 'scheduled' || r.kind !== 'overdue') continue
      const leg = trip.legs.find((l) => l.id === r.leg_id)
      if (leg?.actual_end || leg?.status === 'done') {
        r.status = 'cancelled'
      }
    }

    const planned = rows.filter((r) => r.status === 'scheduled')
    const due = dueCheckpoints(planned, nowIso, firedKeys)

    for (const d of due) {
      const row = rows.find((r) => r.key === d.key)
      if (!row || row.status !== 'scheduled') continue

      const severity = d.kind === 'overdue' ? 'late' : 'attn'
      const tapHint = d.one_tap_token
        ? ` One-tap: /t/${d.one_tap_token}`
        : ''
      const card = raiseException({
        trip_id: tripId,
        trip_ref: trip.ref,
        title: d.title,
        detail: `${d.detail}${tapHint}`,
        severity,
      })

      row.status = 'fired'
      row.fired_at = nowIso
      row.exception_id = card.id
      fired++

      mutateTrip(tripId, (t) => {
        t.events.push({
          at: nowIso,
          actor: 'system',
          kind: 'checkpoint_fired',
          payload: {
            checkpoint_key: d.key,
            kind: d.kind,
            leg_id: d.leg_id,
            exception_id: card.id,
          },
        })
      })
    }
  }

  if (fired) bump()
  return fired
}

/** Ensure all booked/in-progress trips have a schedule (idempotent). */
export function ensureCheckpointsForActiveTrips(): void {
  for (const t of listTripsStable()) {
    if (t.state !== 'booked' && t.state !== 'in_progress') continue
    if (byTrip.has(t.id) && (byTrip.get(t.id)?.length ?? 0) > 0) continue
    scheduleCheckpointsForTrip(t.id)
  }
}

/** Start 30s ticker (dispatcher shell). Safe to call once. */
export function startCheckpointTicker(): () => void {
  ensureCheckpointsForActiveTrips()
  void tickCheckpoints()
  if (ticker) return () => {}
  ticker = setInterval(() => {
    void tickCheckpoints()
  }, 30_000)
  return () => {
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }
}
