/**
 * Unsigned portal gate — dark hero + magic-link card + request CTA (PDF mock).
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { absoluteAppUrl } from '@/lib/appUrl'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const FEATURES = [
  {
    n: '1',
    title: 'Live position & ETA',
    body: 'Tail number, wheels-up, landing and delta against plan.',
  },
  {
    n: '2',
    title: 'Door-to-door visibility',
    body: 'Pickup, FBO handoffs and final delivery on one timeline.',
  },
  {
    n: '3',
    title: 'No password to lose',
    body: 'We email a one-tap sign-in link that lasts 15 minutes.',
  },
] as const

export function PortalLanding() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const addr = email.trim().toLowerCase()
    if (!addr.includes('@')) {
      setError('Enter a work email')
      return
    }
    if (!isSupabaseConfigured || !supabase) {
      setError('Portal login requires Supabase configuration')
      return
    }
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: absoluteAppUrl('/portal') },
      })
      if (err) throw err
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[#0C0C0E] text-cream"
      data-theme="client"
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <img
          src={BRAND_LOGO_PATH}
          alt="OnFly Air"
          className="h-8 w-auto max-w-[160px] object-contain"
        />
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="inline-flex items-center gap-2 rounded-full border border-cream/15 bg-[#141414] px-3 py-1.5 text-[11px] text-cream/85"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D32]" aria-hidden />
          24-hr ops ·{' '}
          <span className="font-semibold text-gold">{BRAND_PHONE}</span>
        </a>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-4 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:pt-10">
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            Client portal
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-cream sm:text-5xl">
            Your freight, in the air and on the screen.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-cream/60">
            Sign in to watch shipments move in real time, or request a new trip
            without an account. Quotes typically come back in 10–15 minutes.
          </p>
          <ol className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.n} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 text-sm font-semibold text-gold">
                  {f.n}
                </span>
                <div>
                  <div className="font-semibold text-cream">{f.title}</div>
                  <p className="mt-0.5 text-sm text-cream/55">{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl bg-white p-5 text-ink shadow-xl sm:p-6">
            {!sent ? (
              <>
                <h2 className="text-lg font-semibold">See your shipments</h2>
                <p className="mt-1 text-sm text-muted">
                  Enter your work email and we&apos;ll send a magic sign-in link
                  — no password needed.
                </p>
                <form onSubmit={sendLink} className="mt-4 space-y-3">
                  <label className="block text-xs font-medium text-muted">
                    Work email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      className="mt-1 w-full rounded-lg border border-[#e5dfd0] bg-[#F7F2E3] px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
                    />
                  </label>
                  {error ? (
                    <p className="text-sm text-[#C0392B]">{error}</p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-gold hover:bg-[#1a1a1a] disabled:opacity-50"
                  >
                    {busy ? 'Sending…' : 'Email me a sign-in link'}
                  </button>
                </form>
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  Only approved work emails can sign in. Access is granted by
                  your company&apos;s email domain (for example{' '}
                  <span className="avionic">@psaairlines.com</span> for PSA) or
                  an exact address OnFly has on file for that client. Personal
                  mailboxes (Gmail, etc.) are not accepted. Not set up yet?
                  Request a trip below and we&apos;ll take it from there.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#2E7D32] text-sm text-white">
                    ✓
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">Check your inbox</h2>
                    <p className="mt-1 text-sm text-muted">
                      We sent a sign-in link to{' '}
                      <span className="font-medium text-ink">{email}</span>. It
                      works once and expires in 15 minutes. After you tap it,
                      you&apos;ll land on your shipments — open any card for
                      live tracking.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                    onClick={() => {
                      setSent(false)
                      setEmail('')
                    }}
                  >
                    Use a different email
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-[#F7F2E3] px-3 py-2 text-sm font-medium disabled:opacity-50"
                    onClick={() => void sendLink({ preventDefault() {} } as FormEvent)}
                  >
                    Resend link
                  </button>
                </div>
              </>
            )}
          </div>

          <Link
            to="/portal/request"
            className="flex items-center justify-between gap-4 rounded-2xl bg-gold px-5 py-5 text-ink transition hover:bg-gold-lt"
          >
            <div>
              <div className="text-lg font-semibold">Request a trip</div>
              <p className="mt-0.5 text-sm text-ink/75">
                No sign-in required. Three quick steps, then we quote it.
              </p>
            </div>
            <span className="text-2xl font-light" aria-hidden>
              →
            </span>
          </Link>

          <div className="rounded-2xl border border-cream/10 bg-[#141414] px-5 py-4 text-sm text-cream/65">
            Time-critical right now? Call 24-hr ops at{' '}
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="font-semibold text-gold"
            >
              {BRAND_PHONE}
            </a>{' '}
            and we&apos;ll build the request with you.
          </div>
        </section>
      </main>
    </div>
  )
}
