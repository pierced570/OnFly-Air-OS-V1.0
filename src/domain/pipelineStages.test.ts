import { describe, expect, it } from 'vitest'
import {
  buildPipeline,
  stageForTripState,
  tripStateLabel,
} from './pipelineStages'

describe('pipelineStages', () => {
  it('maps trip states onto dispatcher stages', () => {
    expect(stageForTripState('quoted_estimated')).toBe('quote')
    expect(stageForTripState('offers_out')).toBe('quote')
    expect(stageForTripState('booked')).toBe('booked')
    expect(stageForTripState('in_progress')).toBe('tracking')
    expect(stageForTripState('invoiced')).toBe('invoice')
    expect(stageForTripState('closed')).toBe('done')
    expect(stageForTripState('lost')).toBe('out')
  })

  it('labels quote/invoice states in plain language', () => {
    expect(tripStateLabel('quoted_estimated')).toBe('Quote sent')
    expect(tripStateLabel('invoiced')).toBe('Invoice sent')
    expect(tripStateLabel('in_progress')).toBe('Tracking')
  })

  it('builds columns from requests and trips', () => {
    const cols = buildPipeline({
      requests: [
        {
          id: 'r1',
          ref: 9001,
          lane: 'KCAK→KMDW',
          summary: '3 skids',
          source: 'portal',
          status: 'submitted',
          email: 'ops@x.com',
        },
      ],
      trips: [
        {
          id: 't1',
          ref: 100,
          lane: 'KTEB→KORD',
          state: 'booked',
          legs: [{ status: 'pending' }],
        },
        {
          id: 't2',
          ref: 101,
          lane: 'KCAK→KMDW',
          state: 'in_progress',
          legs: [{ status: 'done' }, { status: 'active' }],
        },
      ],
    })
    expect(cols.inbound).toHaveLength(1)
    expect(cols.booked).toHaveLength(1)
    expect(cols.tracking[0]?.title).toContain('T-101')
    expect(cols.quote).toHaveLength(0)
  })
})

