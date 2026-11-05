import { describe, expect, it } from 'vitest'
import {
  PORTAL_REQUEST_RECEIVED,
  formatPortalRequestSentClock,
  portalRequestReceivedSteps,
} from './portalRequestReceived'

describe('portalRequestReceived', () => {
  it('keeps client-safe confirmation copy', () => {
    expect(PORTAL_REQUEST_RECEIVED.title).toMatch(/desk phones are ringing/i)
    expect(PORTAL_REQUEST_RECEIVED.body).toMatch(/You approve it before anything is booked/)
    expect(PORTAL_REQUEST_RECEIVED.cta).toBe('Track it in Pending')
  })

  it('builds the four-step timeline with sent clock', () => {
    const steps = portalRequestReceivedSteps(new Date(2026, 10, 4, 19, 12, 0))
    expect(steps).toHaveLength(4)
    expect(steps[0]).toMatchObject({
      label: 'Request sent',
      time: '19:12',
      state: 'done',
    })
    expect(steps[1]?.state).toBe('live')
    expect(steps[2]?.label).toBe('Hard quote ready')
    expect(steps[3]?.label).toMatch(/approve/)
  })

  it('pads single-digit hours and minutes', () => {
    expect(formatPortalRequestSentClock(new Date(2026, 0, 1, 9, 5))).toBe(
      '09:05',
    )
  })
})
