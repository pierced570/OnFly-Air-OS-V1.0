import { describe, expect, it } from 'vitest'
import {
  IllegalTransitionError,
  TRANSITIONS,
  TRIP_STATES,
  canTransition,
  transition,
  type TripState,
} from './stateMachine'

describe('trip state machine', () => {
  it('allows every mapped legal transition', () => {
    for (const from of TRIP_STATES) {
      for (const to of TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true)
        const result = transition(from, to, 'test-actor', { note: 'ok' })
        expect(result.from).toBe(from)
        expect(result.to).toBe(to)
        expect(result.event.kind).toBe('state_transition')
        expect(result.event.payload).toMatchObject({ from, to, note: 'ok' })
        expect(result.event.actor).toBe('test-actor')
      }
    }
  })

  it('rejects illegal transitions', () => {
    const illegal: Array<[TripState, TripState]> = [
      ['draft', 'booked'],
      ['draft', 'lost'],
      ['routed', 'offers_out'],
      ['quoted_estimated', 'booked'],
      ['closed', 'draft'],
      ['lost', 'quoted_hard'],
      ['cancelled', 'in_progress'],
      ['booked', 'lost'],
      ['in_progress', 'closed'],
    ]
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false)
      expect(() => transition(from, to, 'x')).toThrow(IllegalTransitionError)
    }
  })

  it('rejects same-state transitions', () => {
    expect(canTransition('draft', 'draft')).toBe(false)
    expect(() => transition('draft', 'draft', 'x')).toThrow(IllegalTransitionError)
  })

  it('writes an event payload per transition', () => {
    const r = transition('booked', 'in_progress', 'dispatcher:pierce')
    expect(r.event).toEqual({
      kind: 'state_transition',
      actor: 'dispatcher:pierce',
      payload: { from: 'booked', to: 'in_progress' },
    })
  })
})
