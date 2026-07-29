import { afterEach, describe, expect, it, vi } from 'vitest'

describe('portal tracking links', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses VITE_APP_URL not window origin for ETA / portal track links', async () => {
    vi.stubEnv('VITE_APP_URL', 'https://app.onflyair.com')
    const { portalTrackingUrlForTrip } = await import('./etaSheetSender')
    const url = portalTrackingUrlForTrip('trip-1', 'ops@client.test')
    expect(url.startsWith('https://app.onflyair.com/portal/track/')).toBe(true)
    expect(url.includes('vercel.app')).toBe(false)
  })
})
