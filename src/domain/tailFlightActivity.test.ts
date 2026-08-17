import { describe, expect, it } from 'vitest'
import {
  classifyTailFlightBucket,
  filterPortalTailActivity,
  groupTailFlightActivity,
  legsFromSnapshots,
  mockTailFlightSnapshots,
} from './tailFlightActivity'

describe('classifyTailFlightBucket', () => {
  it('maps FA statuses like the activity list', () => {
    expect(
      classifyTailFlightBucket({ status: 'Scheduled' }),
    ).toBe('scheduled')
    expect(
      classifyTailFlightBucket({
        status: 'En Route',
        actualOff: '2026-08-17T13:09:00.000Z',
      }),
    ).toBe('en_route')
    expect(
      classifyTailFlightBucket({
        status: 'Arrived',
        actualOn: '2026-08-15T14:30:00.000Z',
      }),
    ).toBe('arrived')
  })
})

describe('filterPortalTailActivity', () => {
  it('keeps inbound positioning, the live hop, and the previous arrived chain', () => {
    const snaps = mockTailFlightSnapshots({
      tail: 'N4258C',
      originIcao: 'KCAK',
      destIcao: 'KBGR',
      nowIso: '2026-08-17T14:00:00.000Z',
    })
    const legs = filterPortalTailActivity(legsFromSnapshots(snaps), {
      originIcao: 'KCAK',
      destIcao: 'KBGR',
    })
    const groups = groupTailFlightActivity(legs)
    expect(groups.scheduled.map((l) => `${l.originIcao}→${l.destIcao}`)).toEqual([
      'KCAK→KBGR',
    ])
    expect(groups.enRoute.map((l) => `${l.originIcao}→${l.destIcao}`)).toEqual([
      'KPLD→KCAK',
    ])
    expect(groups.arrived.map((l) => `${l.originIcao}→${l.destIcao}`)).toEqual([
      'KMCI→KPLD',
    ])
  })

  it('drops a later hop outbound from dest (other work)', () => {
    const legs = legsFromSnapshots([
      {
        id: 'trip',
        status: 'Scheduled',
        originIcao: 'KCLT',
        destIcao: 'KICT',
        scheduledOff: '2026-08-17T18:00:00.000Z',
      },
      {
        id: 'next-job',
        status: 'Scheduled',
        originIcao: 'KICT',
        destIcao: 'KORD',
        scheduledOff: '2026-08-17T22:00:00.000Z',
      },
    ])
    const kept = filterPortalTailActivity(legs, {
      originIcao: 'KCLT',
      destIcao: 'KICT',
    })
    expect(kept.map((l) => l.id)).toEqual(['trip'])
  })
})
