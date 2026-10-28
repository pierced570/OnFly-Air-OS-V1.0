/**
 * Pure helpers for client PWA / Add-to-Home-Screen UX.
 * No React — keep installability logic testable.
 */

export type PortalInstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown'

export type PortalInstallState = {
  /** Already running as installed PWA / Capacitor / standalone. */
  standalone: boolean
  platform: PortalInstallPlatform
  /** Show "Share → Add to Home Screen" (iOS Safari). */
  showIosHint: boolean
  /** Chromium may fire beforeinstallprompt. */
  canDeferredPrompt: boolean
}

export function detectStandalone(opts: {
  displayModeStandalone?: boolean
  navigatorStandalone?: boolean
  referrer?: string
}): boolean {
  if (opts.displayModeStandalone) return true
  if (opts.navigatorStandalone) return true
  const ref = (opts.referrer ?? '').toLowerCase()
  // Android TWA / shortcut sometimes leave this referrer.
  if (ref.includes('android-app://')) return true
  return false
}

export function detectInstallPlatform(ua: string): PortalInstallPlatform {
  const u = ua.toLowerCase()
  const isIos =
    /iphone|ipad|ipod/.test(u) ||
    // iPadOS 13+ desktop UA
    (/macintosh/.test(u) && u.includes('mobile'))
  if (isIos) return 'ios'
  if (/android/.test(u)) return 'android'
  if (/windows|macintosh|linux|cros/.test(u)) return 'desktop'
  return 'unknown'
}

/** Whether to surface the install banner for this environment. */
export function shouldOfferInstall(state: {
  standalone: boolean
  dismissed: boolean
  platform: PortalInstallPlatform
}): boolean {
  if (state.standalone || state.dismissed) return false
  return (
    state.platform === 'ios' ||
    state.platform === 'android' ||
    state.platform === 'desktop'
  )
}

export function buildPortalInstallState(input: {
  userAgent: string
  displayModeStandalone?: boolean
  navigatorStandalone?: boolean
  referrer?: string
  dismissed?: boolean
}): PortalInstallState & { offer: boolean } {
  const standalone = detectStandalone({
    displayModeStandalone: input.displayModeStandalone,
    navigatorStandalone: input.navigatorStandalone,
    referrer: input.referrer,
  })
  const platform = detectInstallPlatform(input.userAgent)
  const dismissed = Boolean(input.dismissed)
  const offer = shouldOfferInstall({ standalone, dismissed, platform })
  return {
    standalone,
    platform,
    showIosHint: offer && platform === 'ios',
    canDeferredPrompt: offer && (platform === 'android' || platform === 'desktop'),
    offer,
  }
}

export const PORTAL_INSTALL_DISMISS_KEY = 'onfly-portal-install-dismissed'
