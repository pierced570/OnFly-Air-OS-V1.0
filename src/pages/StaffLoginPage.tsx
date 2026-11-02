/**
 * Staff gate — lighter gray surface.
 * Scratchpad: type call notes first, then sign in before moving on.
 * Operations Login: roster name + phone → Dispatch dashboard.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
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
import {
  getScratchPad,
  setScratchPadBody,
  subscribeScratchPad,
} from '@/lib/scratchPadStore'
import { useSyncExternalStore } from 'react'

const LAST_NAME_KEY = 'onfly.staff.login.name.v1'

type ModeId = 'scratch' | 'operations'

function modeFromNext(next: string): ModeId {
  if (
    next === '/scratch' ||
    next.startsWith('/scratch?') ||
    next.startsWith('/scratch/')
  ) {
    return 'scratch'
  }
  return 'operations'
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
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const rawNext = params.get('next')?.trim() || '/dispatch'
  const safeNext = rawNext.startsWith('/') ? rawNext : '/dispatch'

  const [mode, setMode] = useState<ModeId>(() => modeFromNext(safeNext))
  const [name, setName] = useState(() => readLastName())
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rosterReady, setRosterReady] = useState(false)
  const [syncHint, setSyncHint] = useState<string | null>(null)

  const pad = useSyncExternalStore(
    subscribeScratchPad,
    getScratchPad,
    getScratchPad,
  )

  const goPath =
    mode === 'scratch'
      ? '/scratch'
      : safeNext === '/scratch' || safeNext.startsWith('/scratch')
        ? '/dispatch'
        : safeNext.startsWith('/desk')
          ? '/dispatch'
          : safeNext

  // Already signed in → destination (skip form).
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
    if (mode === 'scratch') {
      notesRef.current?.focus()
    } else {
      nameRef.current?.focus()
    }
  }, [mode])

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
      className="relative flex min-h-screen flex-col bg-[#5E5E66] text-cream"
      data-theme="dispatcher"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 45% at 50% -5%, rgba(201,162,39,0.12), transparent 55%), linear-gradient(180deg, #72727A 0%, #5E5E66 50%, #56565E 100%)',
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <Link
          to="/"
          className="text-xs font-semibold text-cream/55 transition hover:text-gold"
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

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-16 pt-2 sm:items-center">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <img
              src={BRAND_LOGO_PATH}
              alt="OnFly Air"
              className="mx-auto h-12 w-auto max-w-[220px] object-contain sm:h-14"
            />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              {BRAND_TAGLINE}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-cream">
              Staff login
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-cream/60">
              Scratchpad for live call notes, or Operations for the dispatch
              dashboard.
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('scratch')}
              className={[
                'rounded-xl border px-3 py-3 text-left transition',
                mode === 'scratch'
                  ? 'border-gold bg-gold/15 text-cream'
                  : 'border-cream/20 bg-cream/[0.06] text-cream/75 hover:border-cream/35 hover:text-cream',
              ].join(' ')}
            >
              <div className="text-sm font-semibold">Scratchpad</div>
              <div className="mt-0.5 text-[11px] text-cream/50">
                Type notes first, then sign in
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode('operations')}
              className={[
                'rounded-xl border px-3 py-3 text-left transition',
                mode === 'operations'
                  ? 'border-gold bg-gold/15 text-cream'
                  : 'border-cream/20 bg-cream/[0.06] text-cream/75 hover:border-cream/35 hover:text-cream',
              ].join(' ')}
            >
              <div className="text-sm font-semibold">Operations Login</div>
              <div className="mt-0.5 text-[11px] text-cream/50">
                Dispatch dashboard
              </div>
            </button>
          </div>

          {mode === 'scratch' ? (
            <div className="mb-4 space-y-2 rounded-2xl border border-cream/20 bg-cream/[0.08] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="staff-scratch-notes"
                  className="text-xs font-medium text-cream/60"
                >
                  Call notes — type now, no login yet
                </label>
                <span className="text-[10px] text-cream/40">
                  Autosaved
                  {pad.updated_at
                    ? ` · ${new Date(pad.updated_at).toLocaleTimeString()}`
                    : ''}
                </span>
              </div>
              <textarea
                id="staff-scratch-notes"
                ref={notesRef}
                value={pad.body}
                onChange={(e) => setScratchPadBody(e.target.value)}
                placeholder={`Acme MRO
KCAK → KMDW
2 skids ASAP
Contact: ops@…`}
                className="min-h-[10rem] w-full resize-y rounded-xl border border-cream/20 bg-[#4A4A52] px-3 py-3 font-mono text-sm leading-relaxed text-cream outline-none placeholder:text-cream/35 focus:border-gold sm:min-h-[12rem]"
                spellCheck
              />
              <p className="text-[11px] text-cream/45">
                When the call ends, sign in below — notes stay with you on the
                scratchpad.
              </p>
            </div>
          ) : null}

          <form
            onSubmit={(e) => void submit(e)}
            className="space-y-4 rounded-2xl border border-cream/20 bg-cream/[0.1] p-5 sm:p-6"
          >
            <p className="text-xs font-medium text-cream/55">
              {mode === 'scratch'
                ? 'Sign in to keep working from this pad'
                : 'Roster name and phone → Operations dashboard'}
            </p>
            <label className="block text-xs font-medium text-cream/60">
              Name on roster
              <input
                ref={nameRef}
                className="mt-1.5 w-full rounded-xl border border-cream/25 bg-[#4A4A52] px-3 py-3.5 text-base text-cream outline-none placeholder:text-cream/35 focus:border-gold"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                placeholder="First Last"
              />
            </label>
            <label className="block text-xs font-medium text-cream/60">
              Phone on roster
              <PhoneInput
                className="mt-1.5 w-full rounded-xl border border-cream/25 bg-[#4A4A52] px-3 py-3.5 font-mono text-base text-cream outline-none focus:border-gold"
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
                  : mode === 'scratch'
                    ? 'Sign in → Scratchpad'
                    : 'Operations Login → Dashboard'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed text-cream/45">
            Need access? Ask Pierce under Admin → Staff access.
            {mode === 'scratch' ? (
              <>
                <br />
                <Link
                  to="/scratch"
                  className="text-cream/60 underline-offset-2 hover:text-gold hover:underline"
                >
                  Open full scratchpad without signing in →
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </main>
    </div>
  )
}
