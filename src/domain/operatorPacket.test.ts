import { describe, expect, it } from 'vitest'
import {
  packetCompleteness,
  quotePrefToLinkChannel,
  validateOperatorPacket,
} from './operatorPacket'

describe('operatorPacket', () => {
  it('maps quote prefs to link channels', () => {
    expect(quotePrefToLinkChannel('text')).toBe('sms')
    expect(quotePrefToLinkChannel('email')).toBe('email')
    expect(quotePrefToLinkChannel('call')).toBe('both')
  })

  it('validates required contact for text/call', () => {
    expect(
      validateOperatorPacket({
        company_name: 'Acme',
        email: 'a@b.com',
        cell: '',
        quote_pref: 'email',
      }),
    ).toBeNull()
    expect(
      validateOperatorPacket({
        company_name: 'Acme',
        email: 'a@b.com',
        cell: '',
        quote_pref: 'text',
      }),
    ).toMatch(/Cell/)
  })

  it('scores completeness', () => {
    expect(
      packetCompleteness({
        has_charter: true,
        has_d085: true,
        has_coi: true,
        has_email: true,
        has_cell: true,
        has_ach: true,
        has_wire: false,
        tail_count: 2,
      }),
    ).toBeGreaterThanOrEqual(80)
  })
})
