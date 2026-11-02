/**
 * One-click client portal sign-in — work email only, no password.
 * Glass card variants for landing + in-app surfaces.
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
  /** Compact cream glass vs landing glass. */
  variant?: 'cream' | 'dark' | 'glass'
  title?: string
  hint?: string
}) {
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => (props.email ?? '').trim().toLowerCase())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const variant = props.variant ?? 'glass'
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
      navigate(props.nextHref ?? '/', { replace: true })
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

  const wrap =
    variant === 'dark'
      ? 'portal-glass-strong rounded-2xl p-5 text-ink sm:p-6'
      : 'portal-glass-strong rounded-2xl p-4 text-ink sm:p-5'
  const inputCls =
    'portal-glass-input mt-1 w-full rounded-xl px-3 py-3 text-sm text-ink'
  const btnCls =
    'w-full min-h-12 rounded-xl bg-gold px-4 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50'

  return (
    <div className={wrap}>
      <h2 className="text-lg font-semibold text-ink">
        {props.title ??
          (prefilled ? 'Client login' : 'Client login')}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {props.hint ??
          (prefilled
            ? 'One tap — we use the email from your request. No password.'
            : 'Just enter your work email — opens live shipments and past trips. No password.')}
      </p>

      {prefilled ? (
        <div className="mt-4 space-y-3">
          <p className="portal-glass-input rounded-xl px-3 py-2.5 text-sm font-medium text-ink">
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
