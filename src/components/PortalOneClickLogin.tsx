/**
 * One-click client portal sign-in — work email only, no password.
 * Used after a quote request (email already known) or as a quiet secondary path.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PortalSession } from '@/domain/portalAuth'
import {
  promotePortalGuestToSignedIn,
  signInPortalByWorkEmail,
} from '@/lib/portalAuth'

export function PortalOneClickLogin(props: {
  /** Prefill from the trip request — enables true one-tap. */
  email?: string | null
  onSignedIn?: (session: PortalSession) => void
  /** After success navigate here (default /portal). */
  nextHref?: string
  /**
   * When set (company portal `/portal/c/:slug`), only that client may sign in.
   */
  expectedClientId?: string | null
  /** Compact cream card vs dark landing. */
  variant?: 'cream' | 'dark'
  title?: string
  hint?: string
}) {
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => (props.email ?? '').trim().toLowerCase())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const variant = props.variant ?? 'cream'
  const prefilled = Boolean((props.email ?? '').trim().includes('@'))

  async function signIn(addr: string) {
    setError(null)
    const cleaned = addr.trim().toLowerCase()
    if (!cleaned.includes('@')) {
      setError('Enter a work email')
      return
    }
    setBusy(true)
    try {
      const session = await signInPortalByWorkEmail(cleaned, {
        expectedClientId: props.expectedClientId,
      })
      promotePortalGuestToSignedIn()
      props.onSignedIn?.(session)
      navigate(props.nextHref ?? '/portal', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await signIn(email)
  }

  const cream = variant === 'cream'
  const wrap = cream
    ? 'rounded-xl border border-[#E5DFD0] bg-white p-4 sm:p-5'
    : 'rounded-2xl bg-white p-5 text-ink shadow-xl sm:p-6'
  const inputCls = cream
    ? 'mt-1 w-full rounded-md border border-[#D4CFC0] bg-[#F7F2E3] px-3 py-3 text-sm text-ink outline-none focus:border-[#C9A227]'
    : 'mt-1 w-full rounded-lg border border-[#e5dfd0] bg-[#F7F2E3] px-3 py-2.5 text-sm text-ink outline-none focus:border-gold'
  const btnCls = cream
    ? 'w-full min-h-12 rounded-md bg-[#C9A227] px-4 text-sm font-semibold text-[#0C0C0E] disabled:opacity-50'
    : 'w-full min-h-12 rounded-lg bg-ink px-4 text-sm font-semibold text-gold disabled:opacity-50'

  return (
    <div className={wrap}>
      <h2 className="text-lg font-semibold text-ink">
        {props.title ??
          (prefilled ? 'Open your trips' : 'Already have a trip?')}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {props.hint ??
          (prefilled
            ? 'One tap — we use the email from your request. No password.'
            : 'Work email only — one tap on this device. Prefer a link in your inbox? Use “Booked with us before?” above.')}
      </p>

      {prefilled ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-md bg-[#F7F2E3] px-3 py-2.5 text-sm font-medium text-ink">
            {email}
          </p>
          {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn(email)}
            className={btnCls}
          >
            {busy ? 'Opening…' : 'Continue with this email'}
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-muted">
            Work email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className={inputCls}
            />
          </label>
          {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}
          <button type="submit" disabled={busy} className={btnCls}>
            {busy ? 'Opening…' : 'Continue'}
          </button>
        </form>
      )}
    </div>
  )
}
