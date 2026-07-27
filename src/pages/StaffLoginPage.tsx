import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PhoneInput from '@/components/PhoneInput'
import { BrandLockup } from '@/components/BrandLockup'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ensureStaffHydrated, loginStaff } from '@/lib/staffStore'

export default function StaffLoginPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rosterReady, setRosterReady] = useState(false)
  const [params] = useSearchParams()
  const nav = useNavigate()
  const next = params.get('next') || '/dispatch'
  const goingToDesk = next === '/desk' || next.startsWith('/desk?')

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
      className="relative flex min-h-screen flex-col items-center justify-center bg-ink px-4 text-cream"
      data-theme="dispatcher"
    >
      <div className="absolute right-4 top-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <BrandLockup variant="mark" className="!h-12 !w-12" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-gold">
              OnFly Air
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-cream">
              Dispatch OS
            </h1>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">
          {goingToDesk
            ? 'Sign in to parse your scratchpad and shortlist operators.'
            : 'Enter your name and phone for general ops (Board, network, trips).'}
        </p>

        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
          <label className="block text-xs text-muted">
            Name
            <input
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-cream outline-none focus:border-gold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              placeholder="First Last"
            />
          </label>
          <label className="block text-xs text-muted">
            Phone
            <PhoneInput
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm text-cream outline-none focus:border-gold"
              value={phone}
              onChange={setPhone}
              required
            />
          </label>
          {error && <p className="text-sm text-late">{error}</p>}
          <button
            type="submit"
            disabled={
              busy || !rosterReady || !name.trim() || phone.length < 10
            }
            className="w-full rounded-md bg-gold py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
          >
            {!rosterReady
              ? 'Loading roster…'
              : busy
                ? 'Checking…'
                : goingToDesk
                  ? 'Login & parse'
                  : 'Enter desk'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted">
          <a href="/" className="text-gold hover:text-gold-lt">
            ← Back to scratchpad
          </a>
          {' · '}no login needed until you parse
        </p>
      </div>
    </div>
  )
}
