/**
 * Trip thread (M8) — pure message templates + pool assignment rules.
 * Vendors/operators coordinate via SMS thread, NOT the client portal.
 * Clients get tracker links; they are not on the ops thread by default.
 */

export type ThreadPartyRole =
  | 'dispatcher'
  | 'pilot'
  | 'operator_ops'
  | 'fbo'
  | 'driver'
  | 'client'
  | 'client_ap'
  | 'client_supply'
  | 'other'

/** Roles that belong on the ops SMS thread (not portal-only). */
export const THREAD_OPS_ROLES: ThreadPartyRole[] = [
  'dispatcher',
  'pilot',
  'operator_ops',
  'fbo',
  'driver',
  'other',
]

/** Client-facing roles — portal / tracker, not ops thread by default. */
export const PORTAL_CLIENT_ROLES: ThreadPartyRole[] = [
  'client',
  'client_ap',
  'client_supply',
]

export function roleOnOpsThread(role: string): boolean {
  return THREAD_OPS_ROLES.includes(role as ThreadPartyRole)
}

export function roleGetsPortalInvite(role: string): boolean {
  return (
    role === 'client' ||
    role === 'client_supply' ||
    role === 'client_ap' ||
    role === 'requester' ||
    role === 'supply_chain' ||
    role === 'ap'
  )
}

export function introSmsBody(opts: {
  tripRef: number
  lane: string
  threadNumber: string
}): string {
  return (
    `You're on OnFly Trip #${opts.tripRef} (${opts.lane}). ` +
    `This thread reaches everyone on the trip — dispatch, crew, ground. ` +
    `Reply here to ${opts.threadNumber}.`
  )
}

export function releaseSmsBody(opts: {
  tripRef: number
  lane: string
}): string {
  return (
    `You're released from OnFly Trip #${opts.tripRef} (${opts.lane}). ` +
    `This thread is closed — no need to reply here.`
  )
}

export function disbandSmsBody(opts: {
  tripRef: number
  lane: string
}): string {
  return (
    `OnFly Trip #${opts.tripRef} (${opts.lane}) is complete. ` +
    `Trip communications are closed. Thanks for flying with OnFly.`
  )
}

export function portalInviteSmsBody(opts: {
  clientName?: string
  portalUrl: string
}): string {
  const who = opts.clientName ? ` for ${opts.clientName}` : ''
  return (
    `OnFly Air portal invite${who}. ` +
    `Sign in with this email at ${opts.portalUrl} to request trips and track live.`
  )
}

export function trackLinkSmsBody(opts: {
  tripRef: number
  trackUrl: string
}): string {
  return (
    `OnFly Trip #${opts.tripRef} live tracking: ${opts.trackUrl} ` +
    `(stop-local ETAs · aircraft position · no login required)`
  )
}

export function oneTapInviteSmsBody(opts: {
  tripRef: number
  label: string
  tapUrl: string
}): string {
  return (
    `OnFly Trip #${opts.tripRef}: tap to confirm ${opts.label} — ${opts.tapUrl}`
  )
}

/**
 * Pick a free pool number: not assigned to another active trip that shares
 * any cell with the candidate participants.
 */
export function pickThreadNumber(
  pool: Array<{ number: string; active: boolean; trip_id: string | null }>,
  opts: {
    candidateCells: string[]
    activeTrips: Array<{ id: string; thread_number: string | null; cells: string[] }>
  },
): string | null {
  const cells = new Set(
    opts.candidateCells.map((c) => c.replace(/\D/g, '')).filter(Boolean),
  )
  for (const row of pool) {
    if (!row.active) continue
    if (row.trip_id) continue
    const conflict = opts.activeTrips.some((t) => {
      if (!t.thread_number || t.thread_number !== row.number) return false
      return t.cells.some((c) => cells.has(c.replace(/\D/g, '')))
    })
    // Also: number already on another active trip (any)
    const inUse = opts.activeTrips.some(
      (t) => t.thread_number === row.number && t.id !== row.trip_id,
    )
    if (conflict || inUse) continue
    return row.number
  }
  // Fallback: any free active number
  const free = pool.find((p) => p.active && !p.trip_id)
  return free?.number ?? null
}

export const THREAD_RELEASE_GRACE_HOURS = 24

export type BankTarget = 'client' | 'operator' | 'skip'

export function defaultBankTarget(role: string): BankTarget {
  if (
    role === 'client' ||
    role === 'client_ap' ||
    role === 'client_supply' ||
    role === 'requester' ||
    role === 'ap' ||
    role === 'supply_chain'
  ) {
    return 'client'
  }
  if (
    role === 'pilot' ||
    role === 'operator_ops' ||
    role === 'fbo' ||
    role === 'driver'
  ) {
    return 'operator'
  }
  return 'skip'
}
