import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPortalGuestTrack,
  readPortalGuestTrack,
  rememberPortalGuestTrack,
} from '@/lib/portalGuestTrack'
import { promotePortalGuestToSignedIn } from '@/lib/portalAuth'

describe('portal session ↔ guest track loop', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })

  afterEach(() => {
    clearPortalGuestTrack()
    vi.unstubAllGlobals()
  })

  it('promotes guest to signed-in by clearing remembered track token', () => {
    rememberPortalGuestTrack({ token: 'tok', tripId: 'trip-1' })
    expect(readPortalGuestTrack()?.token).toBe('tok')
    promotePortalGuestToSignedIn()
    expect(readPortalGuestTrack()).toBeNull()
  })
})
