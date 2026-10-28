/**
 * Add-to-Home-Screen / install prompt for the client portal PWA.
 * iOS: Share → Add to Home Screen. Chromium: beforeinstallprompt.
 */

import { useEffect, useState } from 'react'
import {
  PORTAL_INSTALL_DISMISS_KEY,
  buildPortalInstallState,
  type PortalInstallPlatform,
} from '@/domain/portalPwa'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(PORTAL_INSTALL_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(PORTAL_INSTALL_DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

function liveInstallFlags(dismissed: boolean) {
  const displayModeStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  const navigatorStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  )
  return buildPortalInstallState({
    userAgent: window.navigator.userAgent,
    displayModeStandalone,
    navigatorStandalone,
    referrer: document.referrer,
    dismissed,
  })
}

export function PortalInstallBanner(props: {
  /** dark = portal landing; cream = signed-in shell */
  variant?: 'dark' | 'cream'
}) {
  const variant = props.variant ?? 'cream'
  const [dismissed, setDismissed] = useState(readDismissed)
  const [platform, setPlatform] = useState<PortalInstallPlatform>('unknown')
  const [offer, setOffer] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [iosOpen, setIosOpen] = useState(false)

  useEffect(() => {
    const state = liveInstallFlags(dismissed)
    setPlatform(state.platform)
    setOffer(state.offer)
    setShowIosHint(state.showIosHint)

    if (!state.canDeferredPrompt) return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [dismissed])

  if (!offer) return null
  // Wait for BIP on Chromium when possible; still show a soft tip otherwise.
  const showChromeInstall = Boolean(deferred)
  const showSoftAndroid =
    platform === 'android' && !deferred && !showIosHint
  const showDesktop = platform === 'desktop' && !deferred

  if (!showIosHint && !showChromeInstall && !showSoftAndroid && !showDesktop) {
    return null
  }

  const dark = variant === 'dark'
  const shell = dark
    ? 'border-cream/15 bg-[#141414] text-cream'
    : 'border-[#E5DFD0] bg-white text-ink'
  const muted = dark ? 'text-cream/55' : 'text-[#6B6560]'
  const btn = dark
    ? 'bg-gold text-ink hover:bg-gold-lt'
    : 'bg-[#C9A227] text-[#0C0C0E] hover:brightness-110'

  const dismiss = () => {
    writeDismissed()
    setDismissed(true)
  }

  const installChrome = async () => {
    if (!deferred) return
    await deferred.prompt()
    try {
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') dismiss()
    } catch {
      /* ignore */
    }
    setDeferred(null)
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${shell}`}
      data-testid="portal-install-banner"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C9A227]">
            Install OnFly
          </div>
          <p className={`mt-1 text-sm leading-snug ${muted}`}>
            {showIosHint
              ? 'Add OnFly to your Home Screen for a full-screen client app — book, quote, track, and sign in.'
              : 'Install the OnFly client app on this device for faster access to trips, quotes, and tracking.'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className={`shrink-0 text-xs ${muted} hover:underline`}
          aria-label="Dismiss install tip"
        >
          Not now
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {showChromeInstall ? (
          <button
            type="button"
            onClick={() => void installChrome()}
            className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold ${btn}`}
          >
            Install app
          </button>
        ) : null}

        {showIosHint ? (
          <button
            type="button"
            onClick={() => setIosOpen((v) => !v)}
            className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold ${btn}`}
          >
            {iosOpen ? 'Hide steps' : 'How to add'}
          </button>
        ) : null}

        {showSoftAndroid || showDesktop ? (
          <p className={`w-full text-xs ${muted}`}>
            {showSoftAndroid
              ? 'In Chrome: menu ⋮ → Install app / Add to Home screen.'
              : 'In Chrome or Edge: use Install app from the address bar or browser menu.'}
          </p>
        ) : null}
      </div>

      {showIosHint && iosOpen ? (
        <ol className={`mt-3 list-decimal space-y-1.5 pl-5 text-sm ${muted}`}>
          <li>
            Tap the <span className="font-semibold text-[#C9A227]">Share</span>{' '}
            button in Safari.
          </li>
          <li>
            Scroll and tap{' '}
            <span className="font-semibold text-[#C9A227]">
              Add to Home Screen
            </span>
            .
          </li>
          <li>
            Tap <span className="font-semibold text-[#C9A227]">Add</span> — OnFly
            opens full-screen like an app.
          </li>
        </ol>
      ) : null}
    </div>
  )
}
