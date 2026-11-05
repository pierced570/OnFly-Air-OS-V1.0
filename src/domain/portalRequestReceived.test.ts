import { describe, expect, it } from 'vitest'
import {
  PORTAL_REQUEST_RECEIVED,
  formatPortalRequestSentClock,
  portalRequestReceivedDesktopSteps,
  portalRequestReceivedSteps,
  portalRequestReceivedSummary,
} from './portalRequestReceived'

describe('portalRequestReceived', () => {
  it('keeps client-safe confirmation copy', () => {
    expect(PORTAL_REQUEST_RECEIVED.title).toMatch(/desk phones are ringing/i)
    expect(PORTAL_REQUEST_RECEIVED.body).toMatch(
      /You approve it before anything is booked/,
    )
    expect(PORTAL_REQUEST_RECEIVED.cta).toBe('Track it in Pending')
    expect(PORTAL_REQUEST_RECEIVED.callDesk).toBe('Call the desk')
  })

  it('builds the mobile four-step timeline with sent clock', () => {
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

  it('builds the desktop five-step horizontal timeline', () => {
    const steps = portalRequestReceivedDesktopSteps(
      new Date(2026, 10, 4, 19, 12, 0),
    )
    expect(steps).toHaveLength(5)
    expect(steps.map((s) => s.label)).toEqual([
      'Request sent',
      'Desk calls you',
      'Hard quote ready',
      'You approve',
      'Wheels up',
    ])
    expect(steps[1]?.time).toMatch(/within 10/)
  })

  it('builds desktop summary with estimate band', () => {
    const text = portalRequestReceivedSummary({
      aircraftClass: 'Light jet',
      fromCode: 'KDFW',
      toCode: 'KORD',
      need: 'ASAP',
      estimateLow: 8300,
      estimateHigh: 10400,
    })
    expect(text).toContain('Light jet, KDFW → KORD, ASAP.')
    expect(text).toContain('$8,300 – $10,400')
    expect(text).toMatch(/dispatcher will call/i)
    expect(text).not.toMatch(/operator|margin|bid/i)
  })

  it('pads single-digit hours and minutes', () => {
    expect(formatPortalRequestSentClock(new Date(2026, 0, 1, 9, 5))).toBe(
      '09:05',
    )
  })
})
