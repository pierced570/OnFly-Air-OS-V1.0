/**
 * Chat roster — simple trip member lines for the Chat tool.
 * Trip work (state, lost, tracking) lives in Dispatch center waterfall.
 */

import type { TripState } from '@/domain/stateMachine'

/** Trips “going out” — booked / flying. Not offers or lost. */
export const CHAT_GOING_OUT_STATES: TripState[] = ['booked', 'in_progress']

export function isChatGoingOutState(state: TripState | string): boolean {
  return (CHAT_GOING_OUT_STATES as string[]).includes(state)
}

/** Dispatcher-facing role labels (never “bid”). */
export function chatRoleLabel(role: string): string {
  switch (role) {
    case 'dispatcher':
      return 'Dispatch'
    case 'pilot':
      return 'Pilot'
    case 'operator_ops':
      return 'Operator ops'
    case 'fbo':
      return 'FBO'
    case 'driver':
      return 'Driver'
    case 'client':
      return 'Client'
    case 'client_ap':
      return 'Client AP'
    case 'client_supply':
      return 'Client'
    case 'other':
      return 'Other'
    default:
      return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

export function formatChatMemberLine(input: {
  name: string
  company?: string | null
  role: string
}): string {
  const name = input.name.trim() || '—'
  const company = (input.company ?? '').trim() || '—'
  return `${name} - ${company} - ${chatRoleLabel(input.role)}`
}

/** Roles offered when adding a chat member. */
export const CHAT_MEMBER_ROLES = [
  { value: 'dispatcher', label: 'Dispatch' },
  { value: 'pilot', label: 'Pilot' },
  { value: 'operator_ops', label: 'Operator ops' },
  { value: 'driver', label: 'Driver' },
  { value: 'fbo', label: 'FBO' },
  { value: 'client', label: 'Client' },
  { value: 'client_ap', label: 'Client AP' },
  { value: 'other', label: 'Other' },
] as const
