/**
 * Checkpoint planner — T-minus check-ins derived from trip legs / ETA chain.
 * Pure TS. CHUNK_4: truck T-30/T-5, aircraft T-60/T-30/arrival, overdue watchdogs.
 */

export type CheckpointKind =
  | 'truck_t30'
  | 'truck_t5'
  | 'air_t60'
  | 'air_t30'
  | 'air_arrival'
  | 'overdue'

export type CheckpointParty = 'dispatcher' | 'pilot' | 'driver' | 'ops'

export type LegForCheckpoint = {
  id: string
  seq: number
  type: string
  label: string
  status: string
  party: string
  est_start: string | null
  est_end: string | null
  actual_start: string | null
  actual_end: string | null
  one_tap_token?: string
}

export type PlannedCheckpoint = {
  key: string
  kind: CheckpointKind
  leg_id: string
  leg_label: string
  party: CheckpointParty
  /** UTC ISO when this check-in should fire */
  fire_at: string
  /** Human prompt for dispatcher / SMS */
  title: string
  detail: string
  one_tap_token: string | null
  offset_min: number
}

export type CheckpointDefaults = {
  truckT30: number
  truckT5: number
  airT60: number
  airT30: number
  overdueMin: number
}

export const DEFAULT_CHECKPOINT_DEFAULTS: CheckpointDefaults = {
  truckT30: 30,
  truckT5: 5,
  airT60: 60,
  airT30: 30,
  overdueMin: 20,
}

function isTruckish(type: string): boolean {
  return (
    type === 'truck_pickup' ||
    type === 'truck_delivery' ||
    type === 'offload' ||
    type === 'ground_stop'
  )
}

function isAirish(type: string): boolean {
  return type === 'air_leg' || type === 'position'
}

function minusMin(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() - min * 60_000).toISOString()
}

function plusMin(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString()
}

function partyFor(leg: LegForCheckpoint): CheckpointParty {
  if (leg.party === 'driver') return 'driver'
  if (leg.party === 'pilot') return 'pilot'
  if (isTruckish(leg.type)) return 'driver'
  if (isAirish(leg.type)) return 'pilot'
  return 'ops'
}

/**
 * Build the checkpoint schedule for a dispatched trip's legs.
 * Skips legs that are already done or missing est times.
 */
export function planCheckpoints(
  legs: LegForCheckpoint[],
  defaults: CheckpointDefaults = DEFAULT_CHECKPOINT_DEFAULTS,
): PlannedCheckpoint[] {
  const out: PlannedCheckpoint[] = []

  for (const leg of legs) {
    if (leg.status === 'done') continue
    const start = leg.est_start
    const end = leg.est_end
    if (!start && !end) continue

    const party = partyFor(leg)
    const tap = leg.one_tap_token ?? null

    if (isTruckish(leg.type) && start) {
      out.push({
        key: `${leg.id}:truck_t30`,
        kind: 'truck_t30',
        leg_id: leg.id,
        leg_label: leg.label,
        party,
        fire_at: minusMin(start, defaults.truckT30),
        title: `Truck T-${defaults.truckT30} · ${leg.label}`,
        detail: `Check in with ground / driver — confirm en route to ${leg.label}.`,
        one_tap_token: tap,
        offset_min: -defaults.truckT30,
      })
      out.push({
        key: `${leg.id}:truck_t5`,
        kind: 'truck_t5',
        leg_id: leg.id,
        leg_label: leg.label,
        party,
        fire_at: minusMin(start, defaults.truckT5),
        title: `Truck T-${defaults.truckT5} · ${leg.label}`,
        detail: `Final ground check — confirm arrival / handoff for ${leg.label}.`,
        one_tap_token: tap,
        offset_min: -defaults.truckT5,
      })
    }

    if (isAirish(leg.type) && start) {
      out.push({
        key: `${leg.id}:air_t60`,
        kind: 'air_t60',
        leg_id: leg.id,
        leg_label: leg.label,
        party,
        fire_at: minusMin(start, defaults.airT60),
        title: `Aircraft T-${defaults.airT60} · ${leg.label}`,
        detail: `Check with pilot/ops — positioning / departure for ${leg.label}.`,
        one_tap_token: tap,
        offset_min: -defaults.airT60,
      })
      out.push({
        key: `${leg.id}:air_t30`,
        kind: 'air_t30',
        leg_id: leg.id,
        leg_label: leg.label,
        party,
        fire_at: minusMin(start, defaults.airT30),
        title: `Aircraft T-${defaults.airT30} · ${leg.label}`,
        detail: `Confirm wheels-up window for ${leg.label}.`,
        one_tap_token: tap,
        offset_min: -defaults.airT30,
      })
    }

    if (isAirish(leg.type) && end) {
      out.push({
        key: `${leg.id}:air_arrival`,
        kind: 'air_arrival',
        leg_id: leg.id,
        leg_label: leg.label,
        party,
        fire_at: end,
        title: `Arrival check · ${leg.label}`,
        detail: `Confirm landing / on-deck for ${leg.label}.`,
        one_tap_token: tap,
        offset_min: 0,
      })
    }

    // Overdue watchdog: no actual past est_end + threshold
    if (end && !leg.actual_end && leg.status !== 'done') {
      out.push({
        key: `${leg.id}:overdue`,
        kind: 'overdue',
        leg_id: leg.id,
        leg_label: leg.label,
        party: 'dispatcher',
        fire_at: plusMin(end, defaults.overdueMin),
        title: `Overdue · ${leg.label}`,
        detail: `No actual received ${defaults.overdueMin}m past estimated end — call / text the party.`,
        one_tap_token: tap,
        offset_min: defaults.overdueMin,
      })
    }
  }

  return out.sort((a, b) => a.fire_at.localeCompare(b.fire_at))
}

/** Which planned checkpoints are due at `now` (inclusive). */
export function dueCheckpoints(
  planned: PlannedCheckpoint[],
  nowIso: string,
  alreadyFiredKeys: Set<string>,
): PlannedCheckpoint[] {
  const now = new Date(nowIso).getTime()
  return planned.filter((p) => {
    if (alreadyFiredKeys.has(p.key)) return false
    return new Date(p.fire_at).getTime() <= now
  })
}
