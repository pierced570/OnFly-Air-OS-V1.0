/**
 * Mini top banner: Add to Home Screen for the client portal PWA.
 * Compact by default — expands steps only when tapped.
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
    return sessionStorage.getItem(PORTAL_INSTALL_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    sessionStorage.setItem(PORTAL_INSTALL_DISMISS_KEY, '1')
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
  variant?: 'dark' | 'cream'
  /** @deprecated Mini is the default top-strip layout. */
  defaultOpen?: boolean
}) {
  const variant = props.variant ?? 'cream'
  const [dismissed, setDismissed] = useState(false)
  const [ready, setReady] = useState(false)
  const [platform, setPlatform] = useState<PortalInstallPlatform>('unknown')
  const [offer, setOffer] = useState(true)
  const [showIosHint, setShowIosHint] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [stepsOpen, setStepsOpen] = useState(false)

  useEffect(() => {
    const dismissedNow = readDismissed()
    setDismissed(dismissedNow)
    const state = liveInstallFlags(dismissedNow)
    setPlatform(state.platform)
    setOffer(state.offer)
    setShowIosHint(state.showIosHint)
    setReady(true)

    if (!state.canDeferredPrompt) return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  useEffect(() => {
    if (!ready) return
    const state = liveInstallFlags(dismissed)
    setOffer(state.offer)
    setShowIosHint(state.showIosHint)
    setPlatform(state.platform)
  }, [dismissed, ready])

  if (ready && !offer) return null

  const showChromeInstall = Boolean(deferred)
  const dark = variant === 'dark'
  const bar = dark
    ? 'border-b border-gold/35 bg-[#141414] text-cream'
    : 'border-b border-[#C9A227]/40 bg-[#C9A227]/15 text-ink'
  const muted = dark ? 'text-cream/60' : 'text-[#5A554E]'
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
      className={bar}
      data-testid="portal-install-banner"
      id="add-to-home-screen"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-8">
        <p className="min-w-0 flex-1 text-[12px] leading-snug sm:text-[13px]">
          <span className="font-semibold text-[#C9A227]">Add to Home Screen</span>
          <span className={muted}>
            {' '}
            — full-screen OnFly icon on your phone
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {showChromeInstall ? (
            <button
              type="button"
              onClick={() => void installChrome()}
              className={`inline-flex h-8 items-center rounded-md px-3 text-[11px] font-semibold ${btn}`}
            >
              Install
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepsOpen((v) => !v)}
              className={`inline-flex h-8 items-center rounded-md px-3 text-[11px] font-semibold ${btn}`}
            >
              {stepsOpen ? 'Hide' : 'How'}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm ${muted} hover:text-[#C9A227]`}
            aria-label="Dismiss Add to Home Screen"
          >
            ×
          </button>
        </div>
      </div>

      {stepsOpen && !showChromeInstall ? (
        <ol
          className={`mx-auto max-w-6xl list-decimal space-y-1 border-t px-4 py-2 pl-8 text-[11px] leading-snug sm:px-8 sm:pl-10 ${
            dark ? 'border-cream/10 text-cream/65' : 'border-[#C9A227]/25 text-[#5A554E]'
          }`}
        >
          {showIosHint || platform === 'ios' ? (
            <>
              <li>
                Tap <span className="font-semibold text-[#C9A227]">Share</span> in
                Safari (□↑).
              </li>
              <li>
                Tap{' '}
                <span className="font-semibold text-[#C9A227]">
                  Add to Home Screen
                </span>
                , then Add.
              </li>
            </>
          ) : platform === 'android' ? (
            <li>
              Chrome menu ⋮ →{' '}
              <span className="font-semibold text-[#C9A227]">
                Install app / Add to Home screen
              </span>
              .
            </li>
          ) : (
            <li>
              iPhone Safari: Share → Add to Home Screen. Android Chrome: menu →
              Install app.
            </li>
          )}
        </ol>
      ) : null}
    </div>
  )
}
