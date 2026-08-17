import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetDeskFlashForTests,
  setDeskFlash,
  takeDeskFlash,
} from './deskFlash'

describe('deskFlash', () => {
  beforeEach(() => {
    __resetDeskFlashForTests()
  })

  it('stores and clears a one-shot flash', () => {
    setDeskFlash({
      kind: 'dispatch_complete',
      tripId: 't1',
      po: '00002',
      invoicePending: true,
    })
    expect(takeDeskFlash()?.kind).toBe('dispatch_complete')
    expect(takeDeskFlash()).toBeNull()
  })
})
