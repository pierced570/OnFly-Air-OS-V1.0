/**
 * In-app Add to Home Screen control for the client portal.
 * Always visible on /portal until installed (standalone) or dismissed this tab.
 * iOS: Safari Share steps. Chromium: beforeinstallprompt when offered.
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
  /** Open platform steps immediately (first portal page). */
  defaultOpen?: boolean
  /**
   * Slim top-of-page strip (portal landing). Default = full card used on
   * signed-in Trips / Account.
   */
  density?: 'card' | 'banner'
}) {
  const variant = props.variant ?? 'cream'
  const density = props.density ?? 'card'
  const [dismissed, setDismissed] = useState(false)
  const [ready, setReady] = useState(false)
  const [platform, setPlatform] = useState<PortalInstallPlatform>('unknown')
  const [offer, setOffer] = useState(true)
  const [showIosHint, setShowIosHint] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [stepsOpen, setStepsOpen] = useState(
    Boolean(props.defaultOpen) && density !== 'banner',
  )

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

  // Hide only after we know we're standalone / dismissed — never flash-hide forever.
  if (ready && !offer) return null

  const showChromeInstall = Boolean(deferred)
  const dark = variant === 'dark'
  const shell = dark
    ? 'border-gold/40 bg-gold/10 text-cream'
    : 'border-[#C9A227] bg-[#C9A227]/12 text-ink'
  const muted = dark ? 'text-cream/70' : 'text-[#4A4640]'
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

  const steps = (
    <ol className={`list-decimal space-y-1.5 pl-5 text-sm ${muted}`}>
      {showIosHint || platform === 'ios' ? (
        <>
          <li>
            Tap{' '}
            <span className="font-semibold text-[#C9A227]">Share</span> in
            Safari (square with ↑).
          </li>
          <li>
            Tap{' '}
            <span className="font-semibold text-[#C9A227]">
              Add to Home Screen
            </span>
            .
          </li>
          <li>
            Tap <span className="font-semibold text-[#C9A227]">Add</span> —
            open OnFly from your Home Screen for the app feel.
          </li>
        </>
      ) : platform === 'android' ? (
        <>
          <li>
            Tap browser menu{' '}
            <span className="font-semibold text-[#C9A227]">⋮</span>.
          </li>
          <li>
            Choose{' '}
            <span className="font-semibold text-[#C9A227]">Install app</span> or{' '}
            <span className="font-semibold text-[#C9A227]">
              Add to Home screen
            </span>
            .
          </li>
        </>
      ) : (
        <>
          <li>
            On iPhone: open this page in{' '}
            <span className="font-semibold text-[#C9A227]">Safari</span>, tap
            Share → Add to Home Screen.
          </li>
          <li>
            On Android Chrome: menu → Install app / Add to Home screen.
          </li>
        </>
      )}
    </ol>
  )

  if (density === 'banner') {
    const bar = dark
      ? 'border-b border-gold/35 bg-gold/10 text-cream'
      : 'border-b border-[#C9A227]/40 bg-[#C9A227]/12 text-ink'
    return (
      <div
        className={bar}
        data-testid="portal-install-banner"
        id="add-to-home-screen"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-8">
          <p className={`min-w-0 flex-1 text-xs leading-snug sm:text-sm ${muted}`}>
            <span className="font-semibold text-[#C9A227]">
              Add to Home Screen
            </span>
            {' · '}
            Full-screen OnFly on this phone — book, quote, track.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {showChromeInstall ? (
              <button
                type="button"
                onClick={() => void installChrome()}
                className={`inline-flex min-h-9 items-center rounded-md px-3 text-xs font-semibold ${btn}`}
              >
                Add
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepsOpen((v) => !v)}
                className={`inline-flex min-h-9 items-center rounded-md px-3 text-xs font-semibold ${btn}`}
              >
                {stepsOpen ? 'Hide' : 'How'}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className={`text-xs ${muted} hover:underline`}
              aria-label="Dismiss Add to Home Screen"
            >
              Not now
            </button>
          </div>
        </div>
        {stepsOpen && !showChromeInstall ? (
          <div className="mx-auto max-w-6xl border-t border-gold/20 px-4 py-3 sm:px-8">
            {steps}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border-2 px-4 py-4 ${shell}`}
      data-testid="portal-install-banner"
      id="add-to-home-screen"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C9A227]">
            Add to Home Screen
          </div>
          <p className={`mt-1 text-sm leading-snug ${muted}`}>
            Get the full-screen OnFly app feel on this phone — icon on your Home
            Screen, then book, quote, track, and sign in.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className={`shrink-0 text-xs ${muted} hover:underline`}
          aria-label="Dismiss Add to Home Screen"
        >
          Not now
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {showChromeInstall ? (
          <button
            type="button"
            onClick={() => void installChrome()}
            className={`inline-flex min-h-12 items-center rounded-md px-4 text-sm font-semibold ${btn}`}
          >
            Add to Home Screen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepsOpen((v) => !v)}
            className={`inline-flex min-h-12 items-center rounded-md px-4 text-sm font-semibold ${btn}`}
          >
            {stepsOpen ? 'Hide steps' : 'Show me how'}
          </button>
        )}
      </div>

      {stepsOpen && !showChromeInstall ? (
        <div className="mt-3">{steps}</div>
      ) : null}
    </div>
  )
}
