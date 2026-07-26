/**
 * After call pad → login: AI draft fields, recommend operators, send trip offers.
 * Approve — don't auto-enter.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Candidate } from '@/domain/routing'
import {
  parseScratchToDeskDraft,
  recommendForDeskDraft,
  sendDeskTripOffers,
  type DeskDraft,
} from '@/lib/scratchDeskFlow'
import { getScratchPad } from '@/lib/scratchPadStore'
import { getTrip } from '@/lib/tripStore'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs text-muted'

export default function DeskParsePage() {
  const nav = useNavigate()
  const [draft, setDraft] = useState<DeskDraft | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [sending, setSending] = useState(false)
  const [sentTripId, setSentTripId] = useState<string | null>(null)
  const [recError, setRecError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    void parseScratchToDeskDraft()
      .then(async ({ draft: d }) => {
        if (cancelled) return
        setDraft(d)
        const rec = await recommendForDeskDraft(d)
        if (cancelled) return
        setCandidates(rec.candidates)
        setRecError(rec.error ?? null)
        setSelected(new Set(rec.candidates.slice(0, 5).map((c) => c.aircraft_id)))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scratchPreview = useMemo(() => getScratchPad().body.trim(), [])

  function patch(p: Partial<DeskDraft>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  async function refreshRecs() {
    if (!draft) return
    setBusy(true)
    setRecError(null)
    try {
      const rec = await recommendForDeskDraft(draft)
      setCandidates(rec.candidates)
      setRecError(rec.error ?? null)
      setSelected(new Set(rec.candidates.slice(0, 5).map((c) => c.aircraft_id)))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (!draft) return
    const picks = candidates.filter((c) => selected.has(c.aircraft_id))
    if (!picks.length) {
      setError('Select at least one operator / tail')
      return
    }
    setSending(true)
    setError(null)
    try {
      const trip = await sendDeskTripOffers({ draft, candidates: picks })
      setSentTripId(trip.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  if (sentTripId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-2xl font-semibold text-cream">Offers out</h1>
        <p className="text-sm text-muted">
          Availability checks sent. Operators get a simple Yes / No first, then
          time-to-position, live leg, wait, and price.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/trips/${sentTripId}/offers`}
            className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
          >
            Open compare board
          </Link>
          <Link
            to="/offer/preview"
            className="rounded-md border border-border px-4 py-2 text-sm text-cream"
          >
            Operator board preview
          </Link>
          <Link to="/" className="rounded-md border border-border px-4 py-2 text-sm text-muted">
            Back to call pad
          </Link>
        </div>
        <SentOfferLinks tripId={sentTripId} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Desk</div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            Parse call notes
          </h1>
          <p className="mt-1 text-sm text-muted">
            AI draft — confirm every field before we ping operators.
          </p>
        </div>
        <Link to="/" className="text-sm text-gold hover:text-gold-lt">
          ← Call pad
        </Link>
      </header>

      {scratchPreview && (
        <details className="rounded-lg border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer text-muted">Raw scratch</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-cream/80">
            {scratchPreview}
          </pre>
        </details>
      )}

      {busy && !draft && (
        <p className="text-sm text-muted">Parsing notes…</p>
      )}
      {error && <p className="text-sm text-late">{error}</p>}

      {draft && (
        <>
          <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              Client name
              <input
                className={input}
                value={draft.client_name}
                onChange={(e) => patch({ client_name: e.target.value })}
              />
            </label>
            <label className={label}>
              Origin
              <input
                className={input}
                value={draft.origin_text}
                onChange={(e) => patch({ origin_text: e.target.value })}
                placeholder="KCAK or Akron"
              />
            </label>
            <label className={label}>
              Destination
              <input
                className={input}
                value={draft.destination_text}
                onChange={(e) => patch({ destination_text: e.target.value })}
                placeholder="KMDW or Chicago"
              />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Cargo / mission
              <input
                className={input}
                value={draft.pieces_text}
                onChange={(e) => patch({ pieces_text: e.target.value })}
                placeholder="2 skids 48x40x60 @ 800ea"
              />
            </label>
            <label className={label}>
              Ready
              <input
                className={input}
                value={draft.ready_label}
                onChange={(e) => patch({ ready_label: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-cream">
              <input
                type="checkbox"
                checked={draft.asap}
                onChange={(e) =>
                  patch({
                    asap: e.target.checked,
                    ready_label: e.target.checked ? 'ASAP' : draft.ready_label,
                  })
                }
              />
              ASAP / AOG
            </label>
            <label className="flex items-center gap-2 text-sm text-cream sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.hazmat}
                onChange={(e) => patch({ hazmat: e.target.checked })}
              />
              Hazmat
            </label>
            <div className="sm:col-span-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshRecs()}
                className="rounded-md border border-border px-3 py-2 text-sm text-cream hover:border-gold/40 disabled:opacity-50"
              >
                {busy ? 'Scoring…' : 'Re-score operators'}
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold text-cream">
                Recommended operators
              </h2>
              <Link
                to="/offer/preview"
                className="text-xs text-gold hover:text-gold-lt"
              >
                What they see →
              </Link>
            </div>
            {recError && <p className="text-sm text-late">{recError}</p>}
            {!candidates.length && !recError && (
              <p className="text-sm text-muted">No candidates yet — fix origin/dest/dims.</p>
            )}
            <ul className="space-y-2">
              {candidates.map((c) => {
                const id = c.aircraft_id
                const on = selected.has(id)
                return (
                  <li
                    key={id}
                    className={[
                      'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3',
                      on ? 'border-gold/50 bg-gold/5' : 'border-border bg-surface',
                    ].join(' ')}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={on}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(id)) next.delete(id)
                            else next.add(id)
                            return next
                          })
                        }}
                      />
                      <div>
                        <div className="font-medium text-cream">
                          {c.operator_name}{' '}
                          <span className="avionic text-gold">{c.tail}</span>
                        </div>
                        <div className="text-xs text-muted">
                          {c.type_name} · {c.label ?? 'option'} · confidence{' '}
                          <span className="avionic">
                            {(c.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sending || !selected.size}
              onClick={() => void send()}
              className="rounded-md bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
            >
              {sending
                ? 'Sending…'
                : `Send availability to ${selected.size} operator${selected.size === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => nav('/board')}
              className="rounded-md border border-border px-4 py-2.5 text-sm text-muted"
            >
              Board
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SentOfferLinks({ tripId }: { tripId: string }) {
  const trip = getTrip(tripId)
  if (!trip?.offers.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs uppercase tracking-wider text-muted">
        Operator links
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {trip.offers.map((o) => (
          <li key={o.id}>
            <Link
              className="text-gold hover:text-gold-lt"
              to={`/offer/${o.magic_token}`}
              target="_blank"
              rel="noreferrer"
            >
              {o.operator_name} · {o.tail}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
