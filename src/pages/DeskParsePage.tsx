/**
 * After call pad → login: AI draft fields, recommend operators, send trip offers.
 * Approve — don't auto-enter.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bestClientMatch, matchClients } from '@/domain/matchClient'
import type { Candidate } from '@/domain/routing'
import {
  addClient,
  addClientContact,
  getClient,
  listClients,
  subscribeClients,
} from '@/lib/clientStore'
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

function withClientMatch(d: DeskDraft, directory: { id: string; name: string }[]): DeskDraft {
  if (d.client_id && getClient(d.client_id)) return d
  const best = bestClientMatch(d.client_name, directory)
  if (!best) return { ...d, client_id: null }
  return { ...d, client_id: best.id, client_name: best.name }
}

export default function DeskParsePage() {
  const nav = useNavigate()
  const clients = useSyncExternalStore(subscribeClients, listClients, listClients)
  const [draft, setDraft] = useState<DeskDraft | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [sending, setSending] = useState(false)
  const [sentTripId, setSentTripId] = useState<string | null>(null)
  const [recError, setRecError] = useState<string | null>(null)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newName, setNewName] = useState('')
  const [newInvoice, setNewInvoice] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [ruleChips, setRuleChips] = useState<string[]>([])

  async function applyRecommend(next: DeskDraft) {
    const rec = await recommendForDeskDraft(next)
    setCandidates(rec.candidates)
    setRecError(rec.error ?? null)
    setRuleChips(rec.rule_chips)
    setSelected(new Set(rec.candidates.slice(0, 5).map((c) => c.aircraft_id)))
    return rec
  }

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    void parseScratchToDeskDraft()
      .then(async ({ draft: d }) => {
        if (cancelled) return
        const matched = withClientMatch(d, listClients())
        setDraft(matched)
        if (!matched.client_id && matched.client_name) {
          setNewName(matched.client_name)
          setShowNewClient(true)
        }
        await applyRecommend(matched)
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

  const clientHits = useMemo(() => {
    if (!draft?.client_name.trim()) return []
    return matchClients(draft.client_name, clients, 8)
  }, [draft?.client_name, clients])

  const matchedClient = draft?.client_id ? getClient(draft.client_id) : undefined

  function patch(p: Partial<DeskDraft>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  async function selectClient(id: string) {
    const c = getClient(id)
    if (!c || !draft) return
    const next = { ...draft, client_id: c.id, client_name: c.name }
    setDraft(next)
    setShowNewClient(false)
    setBusy(true)
    setRecError(null)
    try {
      await applyRecommend(next)
    } finally {
      setBusy(false)
    }
  }

  function onClientNameChange(value: string) {
    const best = bestClientMatch(value, clients)
    const nextId = best?.id ?? null
    const prevId = draft?.client_id ?? null
    patch({
      client_name: value,
      client_id: nextId,
    })
    if (best) setShowNewClient(false)
    // Re-score when a directory match appears or clears.
    if (nextId !== prevId && draft) {
      const next = { ...draft, client_name: value, client_id: nextId }
      setBusy(true)
      void applyRecommend(next).finally(() => setBusy(false))
    }
  }

  function saveNewClient() {
    const name = newName.trim() || draft?.client_name.trim()
    if (!name) return
    const c = addClient({
      name,
      email: newInvoice,
      invoice_email: newInvoice,
    })
    const contactEmail = newContactEmail.trim()
    const invEmail = newInvoice.trim()
    if (contactEmail) {
      addClientContact(
        c.id,
        newContactName || contactEmail.split('@')[0] || 'Contact',
        contactEmail,
        'requester',
      )
    }
    if (invEmail && invEmail.toLowerCase() !== contactEmail.toLowerCase()) {
      addClientContact(c.id, invEmail.split('@')[0] || 'AP', invEmail, 'ap')
    }
    void selectClient(c.id)
    setNewName('')
    setNewInvoice('')
    setNewContactName('')
    setNewContactEmail('')
  }

  async function reparse() {
    setBusy(true)
    setError(null)
    setRecError(null)
    try {
      const { draft: d } = await parseScratchToDeskDraft()
      const matched = withClientMatch(d, listClients())
      setDraft(matched)
      if (!matched.client_id && matched.client_name) {
        setNewName(matched.client_name)
        setShowNewClient(true)
      }
      await applyRecommend(matched)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function refreshRecs() {
    if (!draft) return
    setBusy(true)
    setRecError(null)
    try {
      await applyRecommend(draft)
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (!draft) return
    if (!draft.client_id) {
      setError('Match an existing client or add a new client first')
      setShowNewClient(true)
      if (!newName.trim() && draft.client_name) setNewName(draft.client_name)
      return
    }
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
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${label} min-w-[12rem] flex-1`}>
                  Client
                  <input
                    className={input}
                    value={draft.client_name}
                    onChange={(e) => onClientNameChange(e.target.value)}
                    placeholder="Type to match directory…"
                    list="desk-client-directory"
                  />
                  <datalist id="desk-client-directory">
                    {clients.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </label>
                <label className={`${label} min-w-[12rem] flex-1`}>
                  Or pick existing
                  <select
                    className={input}
                    value={draft.client_id ?? ''}
                    onChange={(e) => {
                      if (!e.target.value) {
                        patch({ client_id: null })
                        return
                      }
                      selectClient(e.target.value)
                    }}
                  >
                    <option value="">Select client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewClient((v) => !v)
                    if (!newName.trim() && draft.client_name) setNewName(draft.client_name)
                  }}
                  className="rounded-md border border-border px-3 py-2.5 text-sm text-gold hover:border-gold/40"
                >
                  + Add new client
                </button>
              </div>

              {matchedClient ? (
                <div className="space-y-1">
                  <p className="text-xs text-onplan">
                    Previous client:{' '}
                    <span className="font-medium text-cream">{matchedClient.name}</span>
                    {matchedClient.invoice_email
                      ? ` · ${matchedClient.invoice_email}`
                      : ''}
                    {' — '}
                    operators filtered by their parameters
                  </p>
                  {ruleChips.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {ruleChips.map((chip) => (
                        <li
                          key={chip}
                          className="rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] text-gold"
                        >
                          {chip}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : draft.client_name.trim() ? (
                <p className="text-xs text-late">
                  No exact directory match — pick a suggestion or add a new client.
                </p>
              ) : (
                <p className="text-xs text-muted">
                  Match an existing client or add a new one before sending offers.
                </p>
              )}

              {!matchedClient && clientHits.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {clientHits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => selectClient(h.id)}
                        className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold hover:bg-gold/20"
                      >
                        {h.name}
                        <span className="ml-1 text-muted">({h.kind})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {showNewClient && (
                <div className="space-y-2 rounded-lg border border-border bg-ink/40 p-3">
                  <div className="text-xs uppercase tracking-wider text-gold">
                    Add new client
                  </div>
                  <input
                    className={input}
                    placeholder="Client name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <input
                    className={input}
                    type="email"
                    placeholder="Invoice email"
                    value={newInvoice}
                    onChange={(e) => setNewInvoice(e.target.value)}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      className={input}
                      placeholder="Contact name (optional)"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                    />
                    <input
                      className={input}
                      type="email"
                      placeholder="Contact email"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={saveNewClient}
                      className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
                    >
                      Save client
                    </button>
                    <Link
                      to="/clients"
                      className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-cream"
                    >
                      Open clients directory
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <label className={label}>
              Origin
              <input
                className={input}
                value={draft.origin_text}
                onChange={(e) => patch({ origin_text: e.target.value })}
                placeholder="ICAO, IATA, or city"
              />
            </label>
            <label className={label}>
              Destination
              <input
                className={input}
                value={draft.destination_text}
                onChange={(e) => patch({ destination_text: e.target.value })}
                placeholder="ICAO, IATA, or city"
              />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Cargo / mission
              <input
                className={input}
                value={draft.pieces_text}
                onChange={(e) => patch({ pieces_text: e.target.value })}
                placeholder="e.g. 2 techs + parts, or skid dims @ weight"
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
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void reparse()}
                className="rounded-md border border-border px-3 py-2 text-sm text-cream hover:border-gold/40 disabled:opacity-50"
              >
                {busy ? 'Parsing…' : 'Re-parse notes'}
              </button>
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
            {matchedClient && (
              <p className="text-xs text-muted">
                Shortlist respects {matchedClient.name}&apos;s aircraft rules
                {ruleChips.length ? ` (${ruleChips.length})` : ''}.
              </p>
            )}
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
