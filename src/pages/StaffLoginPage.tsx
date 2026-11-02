/**
 * Desk / scratchpad staff gate — name + phone against the roster.
 * Quiet, readable ink surface (separate from the cream client portal).
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PhoneInput from '@/components/PhoneInput'
import { BrandLockup } from '@/components/BrandLockup'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { ensureStaffHydrated, loginStaff } from '@/lib/staffStore'

export default function StaffLoginPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rosterReady, setRosterReady] = useState(false)
  const [params] = useSearchParams()
  const nav = useNavigate()
  const next = params.get('next') || '/scratch'
  const goingToDesk = next === '/desk' || next.startsWith('/desk?')
  const goingToScratch =
    next === '/scratch' || next.startsWith('/scratch?')

  const destinationLabel = goingToDesk
    ? 'Desk parse'
    : goingToScratch
      ? 'Scratchpad'
      : 'Dispatch'

  const submitLabel = goingToDesk
    ? 'Continue to desk'
    : goingToScratch
      ? 'Open scratchpad'
      : 'Enter dispatch'

  useEffect(() => {
    let cancelled = false
    void ensureStaffHydrated().finally(() => {
      if (!cancelled) setRosterReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    await ensureStaffHydrated()
    const result = loginStaff(name, phone)
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setBusy(false)
    nav(next.startsWith('/') ? next : '/dispatch')
  }

  return (
    <div
      className="relative flex min-h-screen flex-col bg-ink text-cream"
      data-theme="dispatcher"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(201,162,39,0.18),transparent_55%)]" />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <Link to="/" className="text-xs font-semibold uppercase tracking-[0.14em] text-cream/55 hover:text-gold">
          ← Client portal
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <BrandLockup
              variant="bar"
              className="!bg-transparent !px-0 !py-0"
              showTagline={false}
            />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              Staff · {destinationLabel}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-cream">
              Sign in to continue
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-cream/60">
              Use the name and phone on the OnFly roster. Opens{' '}
              <span className="text-cream/90">{destinationLabel.toLowerCase()}</span>
              {goingToScratch
                ? ' — parse when the call ends, or jump into Dispatch.'
                : goingToDesk
                  ? ' to shortlist operators.'
                  : ' for board, network, and trips.'}
            </p>
          </div>

          <form
            onSubmit={(e) => void submit(e)}
            className="space-y-4 rounded-2xl border border-cream/10 bg-cream/[0.04] p-5 sm:p-6"
          >
            <label className="block text-xs font-medium text-cream/55">
              Name
              <input
                className="mt-1.5 w-full rounded-xl border border-cream/15 bg-ink px-3 py-3 text-sm text-cream outline-none placeholder:text-cream/30 focus:border-gold"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                placeholder="First Last"
              />
            </label>
            <label className="block text-xs font-medium text-cream/55">
              Phone
              <PhoneInput
                className="mt-1.5 w-full rounded-xl border border-cream/15 bg-ink px-3 py-3 font-mono text-sm text-cream outline-none focus:border-gold"
                value={phone}
                onChange={setPhone}
                required
              />
            </label>
            {error ? <p className="text-sm text-[#E57373]">{error}</p> : null}
            <button
              type="submit"
              disabled={
                busy || !rosterReady || !name.trim() || phone.length < 10
              }
              className="w-full min-h-12 rounded-xl bg-gold text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
            >
              {!rosterReady
                ? 'Loading roster…'
                : busy
                  ? 'Checking…'
                  : submitLabel}
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-cream/45">
            <a href="/scratch" className="hover:text-gold">
              Scratchpad without login →
            </a>
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="avionic hover:text-gold"
            >
              {BRAND_PHONE}
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
