import { describe, expect, it, beforeEach } from 'vitest'
import {
  addFbo,
  deleteFbo,
  fboNeedsInfoFrom,
  getFbo,
  listFbos,
  updateFbo,
} from './fboStore'

describe('fboStore CRUD', () => {
  beforeEach(() => {
    // Seeds exist from module load — only assert mutations on rows we add.
  })

  it('flags missing after-hours when not 24hr', () => {
    expect(
      fboNeedsInfoFrom({
        phone: '+1',
        after_hours_phone: '',
        is_24hr: false,
        forklift: false,
        forklift_capacity_lbs: null,
        gl_insurance: false,
        fee_handling: 50,
        street: '1 Main',
      }),
    ).toContain('after_hours_phone')
  })

  it('adds updates and deletes an FBO', () => {
    const before = listFbos().length
    const row = addFbo({
      name: 'Test FBO LLC',
      airport_icao: 'KCAK',
      phone: '+13305550101',
      after_hours_phone: '+13305550102',
      is_24hr: true,
      forklift: true,
      forklift_capacity_lbs: 4000,
      gl_insurance: true,
      gl_coverage: 1_000_000,
      fee_handling: 55,
      fee_ramp: 20,
      fee_overnight: 40,
      fee_callout: 80,
      fees_waived_with_fuel: true,
      street: '1 Airport Dr',
      city: 'Akron',
      state: 'OH',
      zip: '44306',
      lat: null,
      lon: null,
      notes: 'test',
    })
    expect(listFbos().length).toBe(before + 1)
    expect(getFbo(row.id)?.name).toBe('Test FBO LLC')

    updateFbo(row.id, { name: 'Test FBO Updated', fee_handling: 60 })
    expect(getFbo(row.id)?.name).toBe('Test FBO Updated')
    expect(getFbo(row.id)?.fee_handling).toBe(60)

    expect(deleteFbo(row.id)).toBe(true)
    expect(getFbo(row.id)).toBeUndefined()
    expect(listFbos().length).toBe(before)
  })
})
