import { describe, expect, it } from 'vitest'
import {
  chatRoleLabel,
  formatChatMemberLine,
  isChatGoingOutState,
} from './chatRoster'

describe('chatRoster', () => {
  it('lists booked / in_progress as going out', () => {
    expect(isChatGoingOutState('booked')).toBe(true)
    expect(isChatGoingOutState('in_progress')).toBe(true)
    expect(isChatGoingOutState('offers_out')).toBe(false)
    expect(isChatGoingOutState('lost')).toBe(false)
  })

  it('formats Name - Company - Role', () => {
    expect(
      formatChatMemberLine({
        name: 'Pierce Demetriades',
        company: 'OnFly Air',
        role: 'dispatcher',
      }),
    ).toBe('Pierce Demetriades - OnFly Air - Dispatch')
    expect(
      formatChatMemberLine({
        name: 'Ben Miller',
        company: 'Air Z',
        role: 'pilot',
      }),
    ).toBe('Ben Miller - Air Z - Pilot')
    expect(chatRoleLabel('operator_ops')).toBe('Operator ops')
  })
})
