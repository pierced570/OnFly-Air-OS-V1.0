import { describe, expect, it } from 'vitest'
import {
  getEtaDefaults,
  resetEtaDefaults,
  setEtaDefault,
} from './etaDefaultsStore'

describe('etaDefaultsStore', () => {
  it('getEtaDefaults returns a stable snapshot when unchanged', () => {
    resetEtaDefaults()
    expect(getEtaDefaults()).toBe(getEtaDefaults())
  })

  it('setEtaDefault replaces the snapshot reference', () => {
    resetEtaDefaults()
    const before = getEtaDefaults()
    setEtaDefault('driver_ttp', before.driver_ttp + 1)
    const after = getEtaDefaults()
    expect(after).not.toBe(before)
    expect(after.driver_ttp).toBe(before.driver_ttp + 1)
    expect(getEtaDefaults()).toBe(after)
  })
})
