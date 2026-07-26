/**
 * After call pad → login: parse notes into a Quick Dispatch–style trip draft
 * (no live leg / no operator pricing), then recommend & send offer links.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
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
  newDeskLeg,
  parseScratchToDeskDraft,
  recommendForDeskDraft,
  sendDeskTripOffers,
  syncDeskDraftDerived,
  type DeskDraft,
  type DeskLeg,
} from '@/lib/scratchDeskFlow'
import {
  getScratchPad,
  subscribeScratchPad,
} from '@/lib/scratchPadStore'
import { getTrip } from '@/lib/tripStore'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold placeholder:text-muted'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'
const seg = (on: boolean) =>
  [
    'flex-1 rounded-md px-3 py-3 text-sm font-semibold',
    on ? 'bg-gold text-ink' : 'bg-transparent text-muted hover:text-cream',
  ].join(' ')

function withClientMatch(
  d: DeskDraft,
  directory: { id: string; name: string }[],
): DeskDraft {
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
    const synced = syncDeskDraftDerived(next)
    const rec = await recommendForDeskDraft(synced)
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

  const liveScratch = useSyncExternalStore(
    subscribeScratchPad,
    () => getScratchPad().body,
    () => getScratchPad().body,
  )
  /** Prefer live pad; fall back to snapshot captured at parse. */
  const rawNotes = (liveScratch.trim() || draft?.raw_notes || '').trim()

  const clientHits = useMemo(() => {
    if (!draft?.client_name.trim()) return []
    return matchClients(draft.client_name, clients, 8)
  }, [draft?.client_name, clients])

  const matchedClient = draft?.client_id ? getClient(draft.client_id) : undefined

  function patch(p: Partial<DeskDraft>) {
    setDraft((d) => (d ? syncDeskDraftDerived({ ...d, ...p }) : d))
  }

  function patchLeg(id: string, p: Partial<DeskLeg>) {
    setDraft((d) => {
      if (!d) return d
      const legs = d.legs.map((l) => (l.id === id ? { ...l, ...p } : l))
      return syncDeskDraftDerived({ ...d, legs })
    })
  }

  async function selectClient(id: string) {
    const c = getClient(id)
    if (!c || !draft) return
    const next = syncDeskDraftDerived({
      ...draft,
      client_id: c.id,
      client_name: c.name,
    })
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

  function onClientSelect(id: string) {
    if (!id) {
      patch({ client_id: null })
      setRuleChips([])
      return
    }
    void selectClient(id)
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
      setError('Select or create a client first')
      setShowNewClient(true)
      if (!newName.trim() && draft.client_name) setNewName(draft.client_name)
      return
    }
    for (const [i, leg] of draft.legs.entries()) {
      if (!leg.origin_icao.trim() || !leg.dest_icao.trim()) {
        setError(`Leg ${i + 1}: origin and destination required`)
        return
      }
      if (draft.timing === 'scheduled' && !leg.date) {
        setError(`Leg ${i + 1}: date required for scheduled`)
        return
      }
    }
    const picks = candidates.filter((c) => selected.has(c.aircraft_id))
    if (!picks.length) {
      setError('Select at least one operator / tail')
      return
    }
    setSending(true)
    setError(null)
    try {
      const trip = await sendDeskTripOffers({
        draft,
        candidates: picks,
      })
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
          Availability links sent. Operators answer Yes / No, then enter tail,
          TTP, live leg, and cost on their form.
        </p>
        <RawCallNotes notes={rawNotes || draft?.raw_notes || ''} />
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/trips/${sentTripId}/offers`}
            className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
          >
            Open operator queue
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 p-4 pb-28 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-cream">Parse call notes</h1>
          <p className="mt-1 text-sm text-muted">
            Quick Dispatch–style trip info from the call pad — no live leg or
            operator pricing. Operators quote on their link.
          </p>
        </div>
        <Link
          to="/"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-cream"
          aria-label="Close"
        >
          ✕
        </Link>
      </header>

      <RawCallNotes notes={rawNotes} />

      {busy && !draft && (
        <p className="text-sm text-muted">Parsing notes…</p>
      )}
      {error && <p className="text-sm text-late">{error}</p>}

      {draft && (
        <>
          <section className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">
              Trip info
            </div>
            <div className="flex items-end gap-2">
              <label className={`${label} flex-1`}>
                Client *
                <select
                  value={draft.client_id ?? ''}
                  onChange={(e) => onClientSelect(e.target.value)}
                  className={input}
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
                className="rounded-md border border-border px-3 py-2.5 text-sm text-gold"
              >
                + New
              </button>
            </div>

            {!draft.client_id && draft.client_name.trim() && (
              <p className="text-xs text-late">
                Parsed “{draft.client_name}” — pick a match or + New.
              </p>
            )}
            {!draft.client_id && clientHits.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {clientHits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => void selectClient(h.id)}
                      className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold"
                    >
                      {h.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {matchedClient && (
              <div className="space-y-1">
                <p className="text-xs text-onplan">
                  Previous client — operators filtered by their parameters
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
            )}

            {showNewClient && (
              <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
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
                <div className="grid grid-cols-2 gap-2">
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
                <button
                  type="button"
                  className="w-full rounded-md bg-gold py-2 text-sm font-medium text-ink"
                  onClick={saveNewClient}
                >
                  Save client
                </button>
              </div>
            )}

            <div className="space-y-2">
              <div className={label}>Timing *</div>
              <div
                className="flex rounded-lg border border-border bg-surface-2 p-0.5"
                role="group"
                aria-label="Trip timing"
              >
                <button
                  type="button"
                  className={seg(draft.timing === 'asap')}
                  onClick={() =>
                    patch({ timing: 'asap', asap: true, ready_label: 'ASAP' })
                  }
                >
                  ASAP
                </button>
                <button
                  type="button"
                  className={seg(draft.timing === 'scheduled')}
                  onClick={() => {
                    const date = draft.legs[0]?.date ?? ''
                    const time =
                      draft.ready_label.match(/\b\d{1,2}:\d{2}\b/)?.[0] ?? ''
                    patch({
                      timing: 'scheduled',
                      asap: false,
                      ready_label:
                        [date, time].filter(Boolean).join(' ') || 'scheduled',
                    })
                  }}
                >
                  Scheduled
                </button>
              </div>
              {draft.timing === 'asap' ? (
                <p className="text-[11px] text-muted">
                  Ready ASAP / AOG — operators see an ASAP availability ask.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className={label}>
                    Ready date
                    <input
                      type="date"
                      className={input}
                      value={draft.legs[0]?.date ?? ''}
                      onChange={(e) => {
                        const date = e.target.value
                        const timePart =
                          draft.ready_label.match(
                            /\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)/i,
                          )?.[0] ?? ''
                        patch({
                          legs: draft.legs.map((l, i) =>
                            i === 0 ? { ...l, date } : l,
                          ),
                          ready_label: [date, timePart].filter(Boolean).join(' '),
                        })
                      }}
                      required
                    />
                  </label>
                  <label className={label}>
                    Ready time
                    <input
                      type="time"
                      className={input}
                      value={(() => {
                        const m = draft.ready_label.match(
                          /\b(\d{1,2}):(\d{2})\b/,
                        )
                        if (!m) return ''
                        return `${m[1]!.padStart(2, '0')}:${m[2]}`
                      })()}
                      onChange={(e) => {
                        const time = e.target.value
                        const date = draft.legs[0]?.date ?? ''
                        patch({
                          ready_label: [date, time].filter(Boolean).join(' '),
                        })
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-cream">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.roundtrip}
                  onChange={(e) => {
                    const roundtrip = e.target.checked
                    const leg0 = draft.legs[0]
                    if (roundtrip && leg0) {
                      // Auto slot return leg (can still + Add Leg for more).
                      const rest = draft.legs.slice(1).filter((l) => {
                        // Drop prior auto-return if origin/dest are swapped of leg0
                        return !(
                          l.origin_icao === leg0.dest_icao &&
                          l.dest_icao === leg0.origin_icao
                        )
                      })
                      patch({
                        roundtrip: true,
                        legs: [
                          leg0,
                          newDeskLeg({
                            origin_icao: leg0.dest_icao,
                            dest_icao: leg0.origin_icao,
                            pax: leg0.pax,
                            date: leg0.date,
                          }),
                          ...rest,
                        ],
                      })
                    } else {
                      patch({
                        roundtrip: false,
                        legs: draft.legs.length > 1 ? [draft.legs[0]!] : draft.legs,
                      })
                    }
                  }}
                />
                Roundtrip
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.cargo_only}
                  onChange={(e) => {
                    const cargo_only = e.target.checked
                    patch({
                      cargo_only,
                      payload_kind: cargo_only ? 'cargo' : 'both',
                      legs: draft.legs.map((l) => ({
                        ...l,
                        pax: cargo_only ? 0 : l.pax,
                      })),
                    })
                    const next = syncDeskDraftDerived({
                      ...draft,
                      cargo_only,
                      payload_kind: cargo_only ? 'cargo' : 'both',
                    })
                    setBusy(true)
                    void applyRecommend(next).finally(() => setBusy(false))
                  }}
                />
                Cargo Only
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.hazmat}
                  onChange={(e) => {
                    const hazmat = e.target.checked
                    patch({ hazmat })
                    setBusy(true)
                    void applyRecommend({ ...draft, hazmat }).finally(() =>
                      setBusy(false),
                    )
                  }}
                />
                Hazmat
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">
                Legs ({draft.legs.length})
              </div>
              <p className="text-[11px] text-muted">
                Add legs if needed — roundtrip adds the return for you
              </p>
            </div>
            {draft.legs.map((leg, idx) => (
              <div
                key={leg.id}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-cream">
                    Leg {idx + 1}
                    {draft.roundtrip &&
                    idx === 1 &&
                    draft.legs[0] &&
                    leg.origin_icao === draft.legs[0].dest_icao &&
                    leg.dest_icao === draft.legs[0].origin_icao
                      ? ' · return'
                      : ''}
                  </div>
                  {draft.legs.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-late"
                      onClick={() => {
                        const nextLegs = draft.legs.filter((l) => l.id !== leg.id)
                        patch({
                          legs: nextLegs,
                          roundtrip:
                            nextLegs.length >= 2 ? draft.roundtrip : false,
                        })
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AirportSelect
                    label="Origin"
                    value={leg.origin_icao}
                    required
                    onChange={(icao) => {
                      let legs = draft.legs.map((l) =>
                        l.id === leg.id ? { ...l, origin_icao: icao } : l,
                      )
                      // Keep roundtrip return leg mirrored from outbound.
                      if (draft.roundtrip && idx === 0 && legs[1]) {
                        legs = legs.map((l, i) =>
                          i === 1
                            ? {
                                ...l,
                                dest_icao: icao,
                                origin_icao:
                                  legs[0]?.dest_icao || l.origin_icao,
                              }
                            : l,
                        )
                      }
                      const next = syncDeskDraftDerived({ ...draft, legs })
                      setDraft(next)
                      setBusy(true)
                      void applyRecommend(next).finally(() => setBusy(false))
                    }}
                  />
                  <AirportSelect
                    label="Destination"
                    value={leg.dest_icao}
                    required
                    onChange={(icao) => {
                      let legs = draft.legs.map((l) =>
                        l.id === leg.id ? { ...l, dest_icao: icao } : l,
                      )
                      if (draft.roundtrip && idx === 0 && legs[1]) {
                        legs = legs.map((l, i) =>
                          i === 1
                            ? {
                                ...l,
                                origin_icao: icao,
                                dest_icao: legs[0]?.origin_icao || l.dest_icao,
                              }
                            : l,
                        )
                      }
                      const next = syncDeskDraftDerived({ ...draft, legs })
                      setDraft(next)
                      setBusy(true)
                      void applyRecommend(next).finally(() => setBusy(false))
                    }}
                  />
                  {draft.timing === 'scheduled' && (
                    <label className={label}>
                      Date
                      <input
                        type="date"
                        className={input}
                        value={leg.date}
                        onChange={(e) =>
                          patchLeg(leg.id, { date: e.target.value })
                        }
                      />
                    </label>
                  )}
                  {!draft.cargo_only && (
                    <label className={label}>
                      PAX
                      <input
                        type="number"
                        min={0}
                        className={input}
                        value={leg.pax}
                        onChange={(e) =>
                          patchLeg(leg.id, {
                            pax: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="w-full rounded-md border border-dashed border-gold/40 px-3 py-2.5 text-sm font-medium text-gold hover:bg-gold/5"
              onClick={() => {
                const last = draft.legs[draft.legs.length - 1]
                patch({
                  legs: [
                    ...draft.legs,
                    newDeskLeg({
                      origin_icao: last?.dest_icao ?? '',
                      pax: draft.cargo_only ? 0 : last?.pax ?? 0,
                    }),
                  ],
                })
              }}
            >
              + Add leg
            </button>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted">
              Cargo / mission
            </div>
            <input
              className={input}
              value={draft.pieces_text}
              onChange={(e) => patch({ pieces_text: e.target.value })}
              placeholder="e.g. tools → standard tooling, or skid dims @ weight"
            />
            <div className="flex flex-wrap gap-2">
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
                Shortlist respects {matchedClient.name}&apos;s aircraft rules.
                No operator pricing here — they quote on the link.
              </p>
            )}
            {recError && <p className="text-sm text-late">{recError}</p>}
            {!candidates.length && !recError && (
              <p className="text-sm text-muted">
                No candidates yet — fix origin/dest/mission.
              </p>
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
                : `Send offer link to ${selected.size} operator${selected.size === 1 ? '' : 's'}`}
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

function RawCallNotes({ notes }: { notes: string }) {
  return (
    <section className="rounded-lg border border-gold/30 bg-gold/5 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-gold">
        Call pad notes
      </div>
      {notes.trim() ? (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-cream/90">
          {notes}
        </pre>
      ) : (
        <p className="mt-2 text-xs text-muted">No call-pad notes captured.</p>
      )}
      <Link to="/" className="mt-2 inline-block text-[11px] text-gold hover:text-gold-lt">
        Edit on call pad →
      </Link>
    </section>
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
