/**
 * Opening page — no login. Notes-style scratch pad for live phone calls.
 * After the call: Login & parse → AI fills fields + operator shortlist.
 * Also embeds compactly inside Dispatch center Work tools.
 */

import { useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
import { ThemeToggle } from '@/components/ThemeToggle'
import { getSession, subscribeStaff } from '@/lib/staffStore'
import {
  getScratchPad,
  setScratchPadBody,
  subscribeScratchPad,
} from '@/lib/scratchPadStore'

export default function ScratchPadPage({
  embedded = false,
  onParse,
}: {
  embedded?: boolean
  /** When set (Dispatch center), parse stays on the waterfall instead of /desk. */
  onParse?: () => void
}) {
  const pad = useSyncExternalStore(
    subscribeScratchPad,
    getScratchPad,
    getScratchPad,
  )
  const session = useSyncExternalStore(subscribeStaff, getSession, getSession)
  const nav = useNavigate()

  function goParse() {
    if (onParse) {
      onParse()
      return
    }
    if (session) {
      nav('/desk')
      return
    }
    nav('/login?next=/desk')
  }

  function goOps() {
    if (session) {
      nav('/dispatch')
      return
    }
    nav('/login?next=/dispatch')
  }

  const textarea = (
    <>
      {!embedded ? (
        <p className="mb-4 text-sm leading-relaxed text-muted">
          Phone rings — open this page and type. Client name, route, cargo,
          timing, whatever you hear. No login until you&apos;re off the call.
          For general ops (no scratch), use{' '}
          <span className="text-cream/80">Login</span>.
        </p>
      ) : (
        <p className="mb-3 text-sm text-muted">
          Live phone notes — parse when you hang up.
        </p>
      )}
      <textarea
        value={pad.body}
        onChange={(e) => setScratchPadBody(e.target.value)}
        placeholder={`Acme MRO
KCAK → KMDW
2 skids 48x40x60 @ 800ea
ASAP / AOG
Forklift at dest
Contact: ops@acme…`}
        className={[
          'flex-1 resize-y rounded-xl border border-border bg-surface px-4 py-4 font-mono text-base leading-relaxed text-cream outline-none placeholder:text-muted focus:border-gold/60',
          embedded ? 'min-h-[45vh]' : 'min-h-[55vh]',
        ].join(' ')}
        autoFocus
        spellCheck
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>
          Autosaved
          {pad.updated_at
            ? ` · ${new Date(pad.updated_at).toLocaleTimeString()}`
            : ''}
        </span>
        <button
          type="button"
          className="text-muted hover:text-gold"
          onClick={() => setScratchPadBody('')}
        >
          Clear Scratchpad
        </button>
      </div>
    </>
  )

  if (embedded) {
    return (
      <div className="flex flex-col p-4 sm:p-6" data-theme="dispatcher">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-cream">Scratchpad</h2>
          <button
            type="button"
            onClick={goParse}
            className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt"
          >
            Parse & shortlist
          </button>
        </div>
        {textarea}
      </div>
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-ink text-cream"
      data-theme="dispatcher"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandLockup variant="mark" className="!h-9 !w-9" showTagline={false} />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
              OnFly Air
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Scratchpad</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={goOps}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-cream hover:border-gold/50"
          >
            {session ? 'Dispatch center' : 'Login'}
          </button>
          <button
            type="button"
            onClick={goParse}
            className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt"
          >
            {session ? 'Parse & shortlist' : 'Login & parse'}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
        {textarea}
      </main>
    </div>
  )
}
