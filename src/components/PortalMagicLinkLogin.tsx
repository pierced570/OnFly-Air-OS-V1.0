/**
 * "Booked with us before?" — enter email → send magic-link login email.
 * Live tracking / history need a signed-in session; quotes stay guest-open.
 */

import { useState, type FormEvent } from 'react'
import { sendPortalMagicLink } from '@/lib/portalMagicLink'

export function PortalMagicLinkLogin(props: {
  /** Prefill (e.g. after quote). */
  email?: string | null
  /** Safe portal path after consume (e.g. /portal/trips/:id). */
  nextHref?: string | null
  /**
   * When set (company portal `/portal/c/:slug`), only that client may sign in.
   */
  expectedClientId?: string | null
  variant?: 'cream' | 'dark'
  title?: string
  hint?: string
  /** CTA when sending. */
  submitLabel?: string
  /** Compact inline after quote. */
  compact?: boolean
}) {
  const [email, setEmail] = useState(() =>
    (props.email ?? '').trim().toLowerCase(),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const variant = props.variant ?? 'cream'
  const cream = variant === 'cream'

  const wrap = cream
    ? props.compact
      ? 'rounded-xl border border-[#E5DFD0] bg-white p-4'
      : 'rounded-xl border border-[#E5DFD0] bg-white p-4 sm:p-5'
    : 'rounded-2xl bg-white p-5 text-ink shadow-xl sm:p-6'
  const inputCls = cream
    ? 'mt-1 w-full rounded-md border border-[#D4CFC0] bg-[#F7F2E3] px-3 py-3 text-sm text-ink outline-none focus:border-[#C9A227]'
    : 'mt-1 w-full rounded-lg border border-[#e5dfd0] bg-[#F7F2E3] px-3 py-2.5 text-sm text-ink outline-none focus:border-gold'
  const btnCls = cream
    ? 'w-full min-h-12 rounded-md bg-[#C9A227] px-4 text-sm font-semibold text-[#0C0C0E] disabled:opacity-50'
    : 'w-full min-h-12 rounded-lg bg-ink px-4 text-sm font-semibold text-gold disabled:opacity-50'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const cleaned = email.trim().toLowerCase()
    if (!cleaned.includes('@')) {
      setError('Enter the email you used with OnFly')
      return
    }
    setBusy(true)
    try {
      const res = await sendPortalMagicLink({
        email: cleaned,
        next: props.nextHref ?? null,
        expectedClientId: props.expectedClientId ?? null,
      })
      setSentTo(res.to)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <div className={wrap} data-testid="portal-magic-link-sent">
        <h2 className="text-lg font-semibold text-ink">Check your email</h2>
        <p className="mt-2 text-sm text-muted">
          We sent a sign-in link to{' '}
          <span className="font-medium text-ink">{sentTo}</span>. Open it on
          this device to track live updates. The link expires in 24 hours.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-gold"
          onClick={() => setSentTo(null)}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className={wrap} data-testid="portal-magic-link-form">
      <h2 className="text-lg font-semibold text-ink">
        {props.title ?? 'Booked with us before?'}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {props.hint ??
          'Enter your email and we\'ll send a one-time link to open your trips and live tracking. No password.'}
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-muted">
          Email
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
          {busy
            ? 'Sending…'
            : (props.submitLabel ?? 'Email me a sign-in link')}
        </button>
      </form>
    </div>
  )
}
