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

const MailIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M4 7l8 6 8-6" />
  </svg>
)

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
  /** Compact cream glass vs landing frost / ofa dark glass. */
  variant?: 'cream' | 'dark' | 'glass' | 'frost' | 'ofa'
  title?: string
  hint?: string
  /** Extra classes on the outer glass wrap (e.g. h-full for aligned landing panels). */
  className?: string
  /** Hide outer chrome when embedded inside a parent `.ofa-login-col`. */
  bare?: boolean
  /** Show Terms / Privacy legal line (login home desktop). */
  showLegal?: boolean
}) {
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => (props.email ?? '').trim().toLowerCase())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const variant = props.variant ?? 'glass'
  const prefilled = Boolean((props.email ?? '').trim().includes('@'))
  const frost = variant === 'frost'
  const ofa = variant === 'ofa'
  const showLegal = props.showLegal ?? ofa

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

  if (ofa) {
    const controls = (
      <>
        <label className="g-field is-active">
          <MailIcon />
          <span className="sr-only">Work email</span>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
            placeholder="Work email"
            autoComplete="email"
            required
            readOnly={prefilled}
          />
        </label>
        {error ? <p className="ofa-login-err">{error}</p> : null}
        <button
          className="g-btn"
          type={prefilled ? 'button' : 'submit'}
          disabled={busy}
          style={{ width: '100%', marginTop: 10 }}
          onClick={prefilled ? () => void signIn(email) : undefined}
        >
          {busy ? 'Opening…' : 'Continue'}
        </button>
        {showLegal ? (
          <p className="ofa-login-legal">
            We email a one-tap sign-in link — no password. By continuing you
            agree to OnFly Air&apos;s{' '}
            <a href="https://onflyair.com/terms" target="_blank" rel="noreferrer">
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="https://onflyair.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
            .
          </p>
        ) : null}
      </>
    )

    const body = prefilled ? (
      <div>{controls}</div>
    ) : (
      <form onSubmit={onSubmit} noValidate>
        {controls}
      </form>
    )

    if (props.bare) {
      return <div className={props.className}>{body}</div>
    }

    return (
      <div
        className={['ofa-login-col', props.className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="ofa-login-col-h">
          <h2>{props.title ?? 'Client login'}</h2>
          <span>{props.hint ?? 'Work email on file'}</span>
        </div>
        {body}
      </div>
    )
  }

  const wrap = frost
    ? 'flex h-full flex-col rounded-3xl border border-white/50 bg-white/40 p-6 text-ink shadow-[0_20px_60px_rgba(12,12,14,0.12)] backdrop-blur-2xl sm:p-7'
    : variant === 'dark'
      ? 'portal-glass-strong rounded-2xl p-5 text-ink sm:p-6'
      : 'portal-glass-strong rounded-2xl p-4 text-ink sm:p-5'
  const inputCls = frost
    ? 'mt-2 w-full border-0 border-b border-ink/25 bg-transparent px-0 py-2.5 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-gold'
    : 'portal-glass-input mt-1 w-full rounded-xl px-3 py-3 text-sm text-ink'
  const btnCls = frost
    ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/20 bg-ink/80 px-6 text-sm font-semibold text-cream backdrop-blur transition hover:bg-ink disabled:opacity-50'
    : 'w-full min-h-12 rounded-xl bg-gold px-4 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50'

  return (
    <div className={[wrap, props.className ?? ''].filter(Boolean).join(' ')}>
      <h2 className={frost ? 'text-2xl font-semibold tracking-tight text-ink' : 'text-lg font-semibold text-ink'}>
        {props.title ?? 'Client login'}
      </h2>
      <p className={frost ? 'mt-2 text-sm leading-relaxed text-ink/60' : 'mt-1 text-sm text-muted'}>
        {props.hint ??
          (prefilled
            ? 'One tap — we use the email from your request. No password.'
            : 'Just enter your work email — opens live shipments and past trips. No password.')}
      </p>

      {prefilled ? (
        <div className={frost ? 'mt-6 flex flex-1 flex-col justify-end space-y-4' : 'mt-6 space-y-4'}>
          <p className={frost ? 'border-b border-ink/25 py-2.5 text-sm font-medium text-ink' : 'portal-glass-input rounded-xl px-3 py-2.5 text-sm font-medium text-ink'}>
            {email}
          </p>
          {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn(email)}
            className={btnCls}
          >
            {busy ? 'Opening…' : 'Continue'}
            {!busy && frost ? <span aria-hidden>→</span> : null}
          </button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className={
            frost ? 'mt-6 flex flex-1 flex-col justify-end space-y-5' : 'mt-4 space-y-3'
          }
        >
          <label className={frost ? 'block text-[11px] font-medium uppercase tracking-[0.14em] text-ink/45' : 'block text-xs font-medium text-muted'}>
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
          <button type="submit" disabled={busy} className={frost ? btnCls : `${btnCls} w-full`}>
            {busy ? 'Opening…' : 'Continue'}
            {!busy && frost ? <span aria-hidden>→</span> : null}
          </button>
        </form>
      )}
    </div>
  )
}
