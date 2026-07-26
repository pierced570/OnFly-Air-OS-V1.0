import { afterEach, describe, expect, it, vi } from 'vitest'

describe('appPublicUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('prefers VITE_APP_URL over window origin', async () => {
    vi.stubEnv('VITE_APP_URL', 'https://app.onflyair.com/')
    const { appPublicUrl, absoluteAppUrl } = await import('./appUrl')
    expect(appPublicUrl()).toBe('https://app.onflyair.com')
    expect(absoluteAppUrl('/offer/abc')).toBe(
      'https://app.onflyair.com/offer/abc',
    )
  })
})
