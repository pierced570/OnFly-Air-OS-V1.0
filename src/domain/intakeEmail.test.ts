import { describe, expect, it } from 'vitest'
import { handleInboundEmail } from './intakeEmail'
import { getMockCommsLog } from '@/adapters/comms'

describe('intake-email stub', () => {
  it('creates extraction and pings mock comms for known requester', async () => {
    const before = getMockCommsLog().length
    const r = await handleInboundEmail({
      from: 'buyer@demo-freight.test',
      subject: 'Need aircraft tomorrow',
      body: '3 skids Akron to Chicago ready 9am',
      requesterMatch: true,
    })
    expect(r.ignored).toBe(false)
    if (!r.ignored) {
      expect(r.extracted.origin_text).toMatch(/Akron/)
    }
    expect(getMockCommsLog().length).toBeGreaterThan(before)
  })
})
