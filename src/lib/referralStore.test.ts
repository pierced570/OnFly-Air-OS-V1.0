import { describe, expect, it, beforeEach } from 'vitest'
import {
  __resetReferralsForTests,
  addReferral,
  listActiveReferrals,
  updateReferral,
} from '@/lib/referralStore'

describe('referralStore snapshots', () => {
  beforeEach(() => {
    __resetReferralsForTests()
  })

  it('listActiveReferrals returns a stable reference when data is unchanged', () => {
    addReferral({ name: 'Active Partner', share_mode: 'flat', share_value: 100 })
    addReferral({
      name: 'Inactive Partner',
      share_mode: 'flat',
      share_value: 50,
      active: false,
    })

    const a = listActiveReferrals()
    const b = listActiveReferrals()
    expect(a).toBe(b)
    expect(a).toHaveLength(1)
    expect(a[0]?.name).toBe('Active Partner')
  })

  it('listActiveReferrals updates after activate/deactivate', () => {
    const row = addReferral({
      name: 'Flip',
      share_mode: 'flat',
      share_value: 25,
    })
    const before = listActiveReferrals()
    expect(before.some((p) => p.id === row.id)).toBe(true)

    updateReferral(row.id, { active: false })
    const after = listActiveReferrals()
    expect(after).not.toBe(before)
    expect(after.some((p) => p.id === row.id)).toBe(false)
  })
})
