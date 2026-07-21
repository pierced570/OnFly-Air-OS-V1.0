/**
 * Client portal magic-link login (Supabase email OTP).
 * Maps verified email → portal_users / client_contacts on first login (staff seeds mapping).
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { BrandLockup } from '@/components/BrandLockup'

export default function PortalLoginPage() {
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
      const redirectTo = `${window.location.origin}/portal`
      const { error: err } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: redirectTo },
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
    <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
      <div className="mx-auto max-w-md space-y-6">
        <header>
          <BrandLockup showTagline={false} />
          <h1 className="mt-2 text-3xl font-semibold">Client portal</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in with the email on file with dispatch. We’ll email a magic
            link — no password.
          </p>
        </header>

        {sent ? (
          <div className="rounded-lg border border-gold/40 bg-white p-4">
            <p className="text-sm text-ink">
              Check <span className="font-medium">{email}</span> for your link.
              After you open it you’ll land on your active trips.
            </p>
            <Link to="/portal" className="mt-3 inline-block text-sm text-gold">
              Continue to portal →
            </Link>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted">
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#d4cfc0] bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
                placeholder="you@company.com"
                autoComplete="email"
              />
            </label>
            {error && <p className="text-sm text-late">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Email magic link'}
            </button>
          </form>
        )}

        <p className="text-xs text-muted">
          Tracking a trip? Use the link from your ETA sheet — no login required.
        </p>
      </div>
    </div>
  )
}
