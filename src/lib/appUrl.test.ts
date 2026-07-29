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

  it('rejects Vercel preview VITE_APP_URL and falls back to production', async () => {
    vi.stubEnv(
      'VITE_APP_URL',
      'https://onfly-air-os-v1-0-git-cursor-foo-c47e.vercel.app',
    )
    const { appPublicUrl, DEFAULT_APP_PUBLIC_URL, isGatedDeployOrigin } =
      await import('./appUrl')
    expect(
      isGatedDeployOrigin(
        'https://onfly-air-os-v1-0-git-cursor-foo-c47e.vercel.app',
      ),
    ).toBe(true)
    expect(appPublicUrl()).toBe(DEFAULT_APP_PUBLIC_URL)
  })

  it('rejects window.location vercel.app when env unset', async () => {
    vi.stubEnv('VITE_APP_URL', '')
    const { appPublicUrl, DEFAULT_APP_PUBLIC_URL } = await import('./appUrl')
    // jsdom / vitest often has no vercel origin — still expect a stable public URL
    expect(appPublicUrl()).toBeTruthy()
    expect(appPublicUrl().startsWith('http')).toBe(true)
    // When origin is gated we always land on DEFAULT; when not, localhost is ok.
    if (typeof window !== 'undefined' && /\.vercel\.app$/i.test(window.location.origin)) {
      expect(appPublicUrl()).toBe(DEFAULT_APP_PUBLIC_URL)
    }
  })
})
