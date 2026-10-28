/**
 * Consume portal magic-link token (`/portal/auth?token=…`).
 * Signs in via work-email domain session, then redirects to safe next.
 */

import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { safePortalNextPath } from '@/domain/portalShareLinks'
import { PortalMagicLinkLogin } from '@/components/PortalMagicLinkLogin'
import { usePortalSession } from '@/hooks/usePortalSession'
import {
  promotePortalGuestToSignedIn,
  signInPortalByWorkEmail,
} from '@/lib/portalAuth'
import { consumePortalLoginToken } from '@/lib/portalLoginStore'

export default function PortalAuthPage() {
  const [params] = useSearchParams()
  const { signedIn, loading, setSession } = usePortalSession()
  const token = (params.get('token') ?? '').trim()
  const nextFromQuery = safePortalNextPath(params.get('next'))
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dest, setDest] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (signedIn) {
      setDest(nextFromQuery ?? '/portal')
      return
    }
    if (!token) {
      setStatus('error')
      setError('Missing sign-in link. Enter your email below for a fresh link.')
      return
    }
    let cancelled = false
    setStatus('working')
    void (async () => {
      const consumed = consumePortalLoginToken(token)
      if (cancelled) return
      if (!consumed) {
        setStatus('error')
        setError(
          'This sign-in link is invalid or expired. Enter your email for a new one.',
        )
        return
      }
      const next = nextFromQuery ?? consumed.next ?? '/portal'
      try {
        const session = await signInPortalByWorkEmail(consumed.email, {
          expectedClientId: consumed.expectedClientId,
        })
        if (cancelled) return
        promotePortalGuestToSignedIn()
        setSession(session)
        setDest(next)
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(
          err instanceof Error
            ? err.message
            : 'Could not open your portal with that email.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, signedIn, token, nextFromQuery, setSession])

  if (dest) {
    return <Navigate to={dest} replace />
  }

  return (
    <div
      className="min-h-screen bg-[#0C0C0E] text-cream"
      data-theme="client"
    >
      <header className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <Link to="/portal">
          <img
            src={BRAND_LOGO_PATH}
            alt="OnFly Air"
            className="h-8 w-auto max-w-[160px] object-contain"
          />
        </Link>
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="text-[11px] font-semibold text-gold"
        >
          {BRAND_PHONE}
        </a>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 pb-16 sm:px-8">
        {status === 'working' || (loading && token) ? (
          <p className="text-sm text-cream/60">Opening your trips…</p>
        ) : null}
        {status === 'error' ? (
          <>
            <h1 className="text-2xl font-semibold text-cream">Sign-in link</h1>
            {error ? (
              <p className="text-sm text-[#E8A0A0]">{error}</p>
            ) : null}
            <PortalMagicLinkLogin
              variant="dark"
              nextHref={nextFromQuery}
              title="Email me a fresh link"
              hint="We'll send a one-time link to open live tracking and your trips."
            />
            <Link
              to="/portal"
              className="block text-center text-sm text-cream/60 hover:text-gold"
            >
              ← Book or get a quote (no account needed)
            </Link>
          </>
        ) : null}
        {!token && status === 'idle' && !loading ? (
          <PortalMagicLinkLogin
            variant="dark"
            nextHref={nextFromQuery}
            title="Booked with us before?"
          />
        ) : null}
      </main>
    </div>
  )
}
