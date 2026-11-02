/**
 * Dispatch staff gate — roster name + phone.
 * Pick Scratchpad / Dispatch / Desk, then sign in. Separate from client portal login.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PhoneInput from '@/components/PhoneInput'
import {
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
  BRAND_TAGLINE,
} from '@/domain/brand'
import {
  ensureStaffHydrated,
  getSession,
  getStaffSyncStatus,
  loginStaff,
  subscribeStaff,
} from '@/lib/staffStore'

const LAST_NAME_KEY = 'onfly.staff.login.name.v1'

type DestId = 'scratch' | 'dispatch' | 'desk'

const DESTINATIONS: Array<{
  id: DestId
  path: string
  label: string
  hint: string
}> = [
  {
    id: 'scratch',
    path: '/scratch',
    label: 'Scratchpad',
    hint: 'Live call notes',
  },
  {
    id: 'dispatch',
    path: '/dispatch',
    label: 'Dispatch',
    hint: 'Board & trips',
  },
  {
    id: 'desk',
    path: '/desk',
    label: 'Desk parse',
    hint: 'AI + shortlist',
  },
]

function destFromNext(next: string): DestId {
  if (next === '/desk' || next.startsWith('/desk?') || next.startsWith('/desk/'))
    return 'desk'
  if (
    next === '/scratch' ||
    next.startsWith('/scratch?') ||
    next.startsWith('/scratch/')
  )
    return 'scratch'
  if (
    next === '/dispatch' ||
    next.startsWith('/dispatch?') ||
    next.startsWith('/dispatch/')
  )
    return 'dispatch'
  // Deep links (board, clients, etc.) — keep dispatch as the visual chip
  return 'dispatch'
}

function readLastName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

function writeLastName(name: string): void {
  try {
    const cleaned = name.trim()
    if (cleaned) localStorage.setItem(LAST_NAME_KEY, cleaned)
  } catch {
    /* ignore */
  }
}

export default function StaffLoginPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const nameRef = useRef<HTMLInputElement>(null)

  const rawNext = params.get('next')?.trim() || '/scratch'
  const safeNext = rawNext.startsWith('/') ? rawNext : '/scratch'

  const [dest, setDest] = useState<DestId>(() => destFromNext(safeNext))
  const [name, setName] = useState(() => readLastName())
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rosterReady, setRosterReady] = useState(false)
  const [syncHint, setSyncHint] = useState<string | null>(null)

  const goPath = useMemo(() => {
    // Preserve deep-link next when it isn't one of the three hubs
    const chip = DESTINATIONS.find((d) => d.id === dest)!
    if (destFromNext(safeNext) === dest && safeNext !== chip.path) {
      return safeNext
    }
    return chip.path
  }, [dest, safeNext])

  const submitLabel =
    dest === 'desk'
      ? 'Sign in → Desk parse'
      : dest === 'scratch'
        ? 'Sign in → Scratchpad'
        : 'Sign in → Dispatch'

  // Already signed in? Skip the form.
  useEffect(() => {
    const existing = getSession()
    if (existing) {
      nav(goPath, { replace: true })
    }
    return subscribeStaff(() => {
      if (getSession()) nav(goPath, { replace: true })
    })
  }, [goPath, nav])

  useEffect(() => {
    let cancelled = false
    void ensureStaffHydrated().finally(() => {
      if (cancelled) return
      setRosterReady(true)
      const sync = getStaffSyncStatus()
      if (sync.ok === false && sync.message) setSyncHint(sync.message)
      else setSyncHint(null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    await ensureStaffHydrated()
    const result = loginStaff(name, phone)
    if (!result.ok) {
      setError(
        result.error ||
          'No match on the roster. Check name + phone, or ask Pierce under Admin → Staff access.',
      )
      setBusy(false)
      return
    }
    writeLastName(result.member.name)
    setBusy(false)
    nav(goPath)
  }

  return (
    <div
      className="relative flex min-h-screen flex-col bg-[#45454C] text-cream"
      data-theme="dispatcher"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 45% at 50% -5%, rgba(201,162,39,0.14), transparent 55%), linear-gradient(180deg, #55555D 0%, #45454C 55%)',
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <Link
          to="/"
          className="text-xs font-semibold text-cream/50 transition hover:text-gold"
        >
          ← Client portal
        </Link>
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="avionic text-xs font-semibold text-gold"
        >
          {BRAND_PHONE}
        </a>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-7 text-center">
            <img
              src={BRAND_LOGO_PATH}
              alt="OnFly Air"
              className="mx-auto h-14 w-auto max-w-[260px] object-contain sm:h-16"
            />
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              {BRAND_TAGLINE}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-cream">
              Dispatch login
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-cream/55">
              Roster name and phone. Pick where you want to land, then sign in.
            </p>
          </div>

          {/* Destination chips — even, clear */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {DESTINATIONS.map((d) => {
              const active = dest === d.id
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDest(d.id)}
                  className={[
                    'rounded-xl border px-2 py-3 text-center transition',
                    active
                      ? 'border-gold bg-gold/15 text-cream'
                      : 'border-cream/12 bg-cream/[0.03] text-cream/70 hover:border-cream/25 hover:text-cream',
                  ].join(' ')}
                >
                  <div className="text-xs font-semibold">{d.label}</div>
                  <div className="mt-0.5 text-[10px] text-cream/45">{d.hint}</div>
                </button>
              )
            })}
          </div>

          <form
            onSubmit={(e) => void submit(e)}
            className="space-y-4 rounded-2xl border border-cream/15 bg-cream/[0.08] p-5 sm:p-6"
          >
            <label className="block text-xs font-medium text-cream/55">
              Name on roster
              <input
                ref={nameRef}
                className="mt-1.5 w-full rounded-xl border border-cream/20 bg-[#3A3A40] px-3 py-3.5 text-base text-cream outline-none placeholder:text-cream/35 focus:border-gold"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                placeholder="First Last"
              />
            </label>
            <label className="block text-xs font-medium text-cream/55">
              Phone on roster
              <PhoneInput
                className="mt-1.5 w-full rounded-xl border border-cream/20 bg-[#3A3A40] px-3 py-3.5 font-mono text-base text-cream outline-none focus:border-gold"
                value={phone}
                onChange={setPhone}
                required
                placeholder="(555) 555-5555"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-[#C0392B]/40 bg-[#C0392B]/10 px-3 py-2.5 text-sm text-[#F5B7B1]">
                {error}
              </div>
            ) : null}

            {syncHint ? (
              <p className="text-xs text-cream/45">
                Roster sync note: {syncHint}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={
                busy || !rosterReady || !name.trim() || phone.length < 10
              }
              className="w-full min-h-12 rounded-xl bg-gold text-sm font-semibold text-ink transition hover:bg-gold-lt disabled:opacity-45"
            >
              {!rosterReady
                ? 'Loading roster…'
                : busy
                  ? 'Checking…'
                  : submitLabel}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed text-cream/40">
            Need access? Ask Pierce under Admin → Staff access.
            <br />
            <Link to="/scratch" className="text-cream/55 underline-offset-2 hover:text-gold hover:underline">
              Open scratchpad without signing in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
