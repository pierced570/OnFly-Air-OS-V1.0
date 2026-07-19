import { describe, expect, it } from 'vitest'
import { parseAvailabilityReply, availabilityPingBody } from './offers'

describe('offers language', () => {
  it('parses 1/yes and 2/no', () => {
    expect(parseAvailabilityReply('1')).toBe('available')
    expect(parseAvailabilityReply('YES')).toBe('available')
    expect(parseAvailabilityReply('2')).toBe('unavailable')
    expect(parseAvailabilityReply('no thanks')).toBe('unavailable')
    expect(parseAvailabilityReply('maybe')).toBeNull()
  })

  it('ping copy says trip offer never bid', () => {
    const body = availabilityPingBody('CAK→MDW', '~800 lbs freight', '14:00E')
    expect(body.toLowerCase()).toContain('trip offer')
    expect(body.toLowerCase()).not.toContain('bid')
  })
})
