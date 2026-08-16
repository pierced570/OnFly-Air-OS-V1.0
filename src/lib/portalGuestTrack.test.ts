import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPortalGuestTrack,
  readPortalGuestTrack,
  rememberPortalGuestTrack,
} from '@/lib/portalGuestTrack'

describe('portalGuestTrack', () => {
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

  it('remembers and reads a guest track token', () => {
    rememberPortalGuestTrack({ token: 'tok-1', tripId: 'trip-1' })
    expect(readPortalGuestTrack()).toEqual(
      expect.objectContaining({ token: 'tok-1', tripId: 'trip-1' }),
    )
  })

  it('clears a stale guest track so the landing / sign-in gate can show', () => {
    rememberPortalGuestTrack({ token: 'stale', tripId: 'gone' })
    clearPortalGuestTrack()
    expect(readPortalGuestTrack()).toBeNull()
  })
})
