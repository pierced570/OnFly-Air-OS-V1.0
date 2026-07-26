import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetGroundCouriersForTests,
  listGroundCouriers,
  removeGroundCourier,
  upsertGroundCourier,
} from './groundCourierStore'

describe('groundCourierStore', () => {
  beforeEach(() => {
    __resetGroundCouriersForTests()
  })

  it('adds and lists couriers', () => {
    upsertGroundCourier({
      name: 'Fast Hotshot',
      phone: '2165550100',
      service_areas: 'CLE · CAK · PIT',
    })
    expect(listGroundCouriers()).toHaveLength(1)
    expect(listGroundCouriers()[0]?.name).toBe('Fast Hotshot')
  })

  it('updates and removes', () => {
    const row = upsertGroundCourier({ name: 'A' })
    upsertGroundCourier({ id: row.id, name: 'B', phone: '1' })
    expect(listGroundCouriers()[0]?.name).toBe('B')
    removeGroundCourier(row.id)
    expect(listGroundCouriers()).toHaveLength(0)
  })
})
