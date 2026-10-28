import { describe, expect, it } from 'vitest'
import {
  buildPortalInstallState,
  detectInstallPlatform,
  detectStandalone,
  shouldOfferInstall,
} from '@/domain/portalPwa'

describe('portalPwa', () => {
  it('detects standalone via display-mode or iOS navigator', () => {
    expect(detectStandalone({ displayModeStandalone: true })).toBe(true)
    expect(detectStandalone({ navigatorStandalone: true })).toBe(true)
    expect(
      detectStandalone({ referrer: 'android-app://com.onflyair.client' }),
    ).toBe(true)
    expect(detectStandalone({})).toBe(false)
  })

  it('classifies iOS / Android / desktop UAs', () => {
    expect(
      detectInstallPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe('ios')
    expect(
      detectInstallPlatform(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile',
      ),
    ).toBe('android')
    expect(
      detectInstallPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120',
      ),
    ).toBe('desktop')
  })

  it('offers install unless standalone or dismissed', () => {
    expect(shouldOfferInstall({ standalone: false, dismissed: false })).toBe(
      true,
    )
    expect(shouldOfferInstall({ standalone: true, dismissed: false })).toBe(
      false,
    )
    expect(shouldOfferInstall({ standalone: false, dismissed: true })).toBe(
      false,
    )
  })

  it('builds iOS hint vs deferred-prompt flags', () => {
    const ios = buildPortalInstallState({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    })
    expect(ios.offer).toBe(true)
    expect(ios.showIosHint).toBe(true)
    expect(ios.canDeferredPrompt).toBe(false)

    const android = buildPortalInstallState({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile',
    })
    expect(android.canDeferredPrompt).toBe(true)
    expect(android.showIosHint).toBe(false)
  })
})
