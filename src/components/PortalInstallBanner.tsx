/**
 * In-app Add to Home Screen / install control for the client portal PWA.
 * iOS cannot be installed programmatically — we open Safari Share steps.
 * Chromium uses beforeinstallprompt when the browser offers it.
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
  /** First portal page — open iOS steps by default. */
  defaultOpen?: boolean
}) {
  const variant = props.variant ?? 'cream'
  const [dismissed, setDismissed] = useState(readDismissed)
  const [platform, setPlatform] = useState<PortalInstallPlatform>('unknown')
  const [offer, setOffer] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [stepsOpen, setStepsOpen] = useState(Boolean(props.defaultOpen))

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

  const showChromeInstall = Boolean(deferred)
  const showManual =
    showIosHint ||
    (platform === 'android' && !deferred) ||
    (platform === 'desktop' && !deferred)

  if (!showChromeInstall && !showManual) return null

  const dark = variant === 'dark'
  const shell = dark
    ? 'border-gold/35 bg-[#141414] text-cream'
    : 'border-[#C9A227]/45 bg-white text-ink shadow-sm'
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
      className={`rounded-2xl border px-4 py-4 ${shell}`}
      data-testid="portal-install-banner"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C9A227]">
            Add to Home Screen
          </div>
          <p className={`mt-1 text-sm leading-snug ${muted}`}>
            Put OnFly on your phone like an app — full screen, home-screen icon,
            same portal for book, quote, track, and sign-in.
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
            {stepsOpen ? 'Hide steps' : 'Add to Home Screen'}
          </button>
        )}
      </div>

      {stepsOpen && !showChromeInstall ? (
        <ol className={`mt-3 list-decimal space-y-1.5 pl-5 text-sm ${muted}`}>
          {showIosHint ? (
            <>
              <li>
                Tap the{' '}
                <span className="font-semibold text-[#C9A227]">Share</span>{' '}
                button in Safari (square with an arrow).
              </li>
              <li>
                Scroll and tap{' '}
                <span className="font-semibold text-[#C9A227]">
                  Add to Home Screen
                </span>
                .
              </li>
              <li>
                Tap{' '}
                <span className="font-semibold text-[#C9A227]">Add</span> — OnFly
                opens full-screen like an app.
              </li>
            </>
          ) : platform === 'android' ? (
            <>
              <li>
                Tap the browser menu{' '}
                <span className="font-semibold text-[#C9A227]">⋮</span>.
              </li>
              <li>
                Choose{' '}
                <span className="font-semibold text-[#C9A227]">
                  Install app
                </span>{' '}
                or{' '}
                <span className="font-semibold text-[#C9A227]">
                  Add to Home screen
                </span>
                .
              </li>
            </>
          ) : (
            <>
              <li>
                In Chrome or Edge, open the install icon in the address bar — or
                the browser menu.
              </li>
              <li>
                Choose{' '}
                <span className="font-semibold text-[#C9A227]">Install app</span>
                .
              </li>
            </>
          )}
        </ol>
      ) : null}
    </div>
  )
}
