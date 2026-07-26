/**
 * After call pad → login: parse notes into a Quick Dispatch–style trip draft
 * (no live leg / no operator pricing), then recommend & send offer links.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { bestClientMatch, matchClients } from '@/domain/matchClient'
import {
  DEFAULT_QUOTE_LINK_CHANNEL,
  type QuoteLinkChannel,
} from '@/domain/quoteLinkChannel'
import type { Candidate } from '@/domain/routing'
import {
  STANDARD_CARGO_DEFAULTS,
  STANDARD_TOOLING,
  composeStandardCargoDims,
  parseStandardCargoDims,
  type StandardCargoDims,
} from '@/domain/standardTooling'
import {
  addClient,
  addClientContact,
  getClient,
  listClients,
  subscribeClients,
} from '@/lib/clientStore'
import {
  addDeskOperator,
  candidateFromDeskHit,
  contactOverrideFromHit,
  ensureDeskOperatorsLoaded,
  listDeskOperators,
  searchDeskOperators,
  toDeskOperatorHit,
  type DeskContactOverride,
  type DeskOperatorHit,
} from '@/lib/deskOperatorSearch'
import { updateSheetOperatorField } from '@/lib/networkSheetStore'
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
  /** Extra candidates pulled via operator search (not from recommend). */
  const [extraCandidates, setExtraCandidates] = useState<Candidate[]>([])
  const [contactOverrides, setContactOverrides] = useState<
    Record<string, DeskContactOverride>
  >({})
  const [opQuery, setOpQuery] = useState('')
  const [showAddOp, setShowAddOp] = useState(false)
  const [addOpName, setAddOpName] = useState('')
  const [addOpBase, setAddOpBase] = useState('')
  const [addOpEmail, setAddOpEmail] = useState('')
  const [addOpCell, setAddOpCell] = useState('')
  const [addOpChannel, setAddOpChannel] = useState<QuoteLinkChannel>(
    DEFAULT_QUOTE_LINK_CHANNEL,
  )

  function seedOverride(hit: DeskOperatorHit) {
    setContactOverrides((prev) => {
      if (prev[hit.operator_id]) return prev
      return { ...prev, [hit.operator_id]: contactOverrideFromHit(hit) }
    })
  }

  function seedOverrideForCandidate(c: Candidate) {
    const op = listDeskOperators().find((o) => o.id === c.operator_id)
    if (op) seedOverride(toDeskOperatorHit(op))
    else {
      setContactOverrides((prev) => {
        if (prev[c.operator_id]) return prev
        return {
          ...prev,
          [c.operator_id]: {
            contact_email: '',
            contact_cell: '',
            quote_link_channel: DEFAULT_QUOTE_LINK_CHANNEL,
          },
        }
      })
    }
  }

  async function applyRecommend(next: DeskDraft) {
    const synced = syncDeskDraftDerived(next)
    const rec = await recommendForDeskDraft(synced)
    setCandidates(rec.candidates)
    setRecError(rec.error ?? null)
    setRuleChips(rec.rule_chips)
    // Never auto-select recommended operators — dispatcher chooses.
    return rec
  }

  /** Profile contacts for display / send — blank until the profile has them. */
  function profileContactsForOperator(
    operatorId: string,
  ): DeskContactOverride {
    const op = listDeskOperators().find((o) => o.id === operatorId)
    if (op) return contactOverrideFromHit(toDeskOperatorHit(op))
    return {
      contact_email: '',
      contact_cell: '',
      quote_link_channel: DEFAULT_QUOTE_LINK_CHANNEL,
    }
  }

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    void ensureDeskOperatorsLoaded()
      .then(() => parseScratchToDeskDraft())
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

  const opHits = useMemo(
    () => searchDeskOperators(opQuery, 8),
    [opQuery, contactOverrides],
  )

  const allCandidates = useMemo(() => {
    const byAc = new Map<string, Candidate>()
    for (const c of candidates) byAc.set(c.aircraft_id, c)
    for (const c of extraCandidates) {
      if (!byAc.has(c.aircraft_id)) byAc.set(c.aircraft_id, c)
    }
    return [...byAc.values()]
  }, [candidates, extraCandidates])

  const selectedCandidates = useMemo(
    () => allCandidates.filter((c) => selected.has(c.aircraft_id)),
    [allCandidates, selected],
  )

  function patchOverride(
    operatorId: string,
    patch: Partial<DeskContactOverride>,
  ) {
    setContactOverrides((prev) => {
      const cur = prev[operatorId] ?? {
        contact_email: '',
        contact_cell: '',
        quote_link_channel: DEFAULT_QUOTE_LINK_CHANNEL,
      }
      return { ...prev, [operatorId]: { ...cur, ...patch } }
    })
  }

  function addOperatorHit(hit: DeskOperatorHit) {
    const cand = candidateFromDeskHit(hit)
    setExtraCandidates((prev) => {
      if (prev.some((c) => c.aircraft_id === cand.aircraft_id)) return prev
      if (candidates.some((c) => c.aircraft_id === cand.aircraft_id)) return prev
      return [...prev, cand]
    })
    setSelected((prev) => new Set(prev).add(cand.aircraft_id))
    seedOverride(hit)
    setOpQuery('')
  }

  function saveNewOperator() {
    try {
      const hit = addDeskOperator({
        name: addOpName,
        base_icao: addOpBase,
        contact_email: addOpEmail,
        contact_cell: addOpCell,
        quote_link_channel: addOpChannel,
      })
      addOperatorHit(hit)
      setShowAddOp(false)
      setAddOpName('')
      setAddOpBase('')
      setAddOpEmail('')
      setAddOpCell('')
      setAddOpChannel(DEFAULT_QUOTE_LINK_CHANNEL)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

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
    const picks = allCandidates.filter((c) => selected.has(c.aircraft_id))
    if (!picks.length) {
      setError('Select at least one operator')
      return
    }
    setSending(true)
    setError(null)
    try {
      const overridesForSend: Record<string, DeskContactOverride> = {}
      // Persist desk-edited contacts onto the operator profile when filled.
      for (const c of picks) {
        const ov =
          contactOverrides[c.operator_id] ??
          profileContactsForOperator(c.operator_id)
        overridesForSend[c.operator_id] = ov
        if (ov.contact_email.trim()) {
          updateSheetOperatorField(
            c.operator_id,
            'contact_email',
            ov.contact_email.trim(),
          )
        }
        if (ov.contact_cell.trim()) {
          updateSheetOperatorField(
            c.operator_id,
            'contact_cell',
            ov.contact_cell.trim(),
          )
        }
        updateSheetOperatorField(
          c.operator_id,
          'quote_link_channel',
          ov.quote_link_channel,
        )
      }
      const trip = await sendDeskTripOffers({
        draft,
        candidates: picks,
        contactOverrides: overridesForSend,
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
          Offer links ready — operators are not auto-pinged. Share a link; they
          answer Yes / No, then enter their aircraft, times, and price on their
          form.
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

          <section className="space-y-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">
                {STANDARD_TOOLING.ui_label}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Tools default to 12×12×12 @ 50 lb.
              </p>
            </div>
            <StandardCargoFields
              piecesText={draft.pieces_text}
              onDimsChange={(dims) => {
                const pieces_text = composeStandardCargoDims(dims)
                const next = syncDeskDraftDerived({ ...draft, pieces_text })
                setDraft(next)
                if (dims.length && dims.width && dims.height && dims.weight) {
                  setBusy(true)
                  void applyRecommend(next).finally(() => setBusy(false))
                }
              }}
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold text-cream">
                Operator search
              </h2>
              <button
                type="button"
                className="text-xs text-gold hover:text-gold-lt"
                onClick={() => setShowAddOp((v) => !v)}
              >
                {showAddOp ? 'Cancel' : '+ Add new operator'}
              </button>
            </div>
            <label className={label}>
              Search operators
              <input
                className={input}
                value={opQuery}
                onChange={(e) => setOpQuery(e.target.value)}
                placeholder="Name, base, email, or phone"
              />
            </label>
            {opQuery.trim() && (
              <ul className="space-y-2">
                {opHits.length === 0 && (
                  <li className="text-sm text-muted">No operators match.</li>
                )}
                {opHits.map((hit) => (
                  <li
                    key={hit.operator_id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-cream">{hit.name}</div>
                      <div className="mt-1 grid gap-0.5 text-xs text-muted sm:grid-cols-2">
                        <span>
                          Location:{' '}
                          <span className="avionic text-cream">
                            {hit.base_icao || '—'}
                          </span>
                        </span>
                        <span>
                          Email:{' '}
                          <span className="text-cream">
                            {hit.contact_email || '—'}
                          </span>
                        </span>
                        <span>
                          Text:{' '}
                          <span className="avionic text-cream">
                            {hit.contact_cell || '—'}
                          </span>
                        </span>
                        <span>
                          Links:{' '}
                          {hit.quote_link_channel === 'both'
                            ? 'Email + SMS'
                            : hit.quote_link_channel === 'email'
                              ? 'Email only'
                              : 'SMS only'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-ink"
                      onClick={() => addOperatorHit(hit)}
                    >
                      Add to send
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showAddOp && (
              <div className="space-y-2 rounded-lg border border-gold/30 bg-gold/5 p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-gold">
                  New operator
                </div>
                <input
                  className={input}
                  placeholder="Operator name *"
                  value={addOpName}
                  onChange={(e) => setAddOpName(e.target.value)}
                />
                <AirportSelect
                  label="Base"
                  value={addOpBase}
                  onChange={setAddOpBase}
                  placeholder="Search ICAO, city, or state…"
                />
                <label className={label}>
                  Quote links
                  <select
                    className={input}
                    value={addOpChannel}
                    onChange={(e) =>
                      setAddOpChannel(e.target.value as QuoteLinkChannel)
                    }
                  >
                    <option value="both">Email + SMS</option>
                    <option value="email">Email only</option>
                    <option value="sms">SMS only</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className={input}
                    type="email"
                    placeholder="Email"
                    value={addOpEmail}
                    onChange={(e) => setAddOpEmail(e.target.value)}
                  />
                  <input
                    className={input}
                    placeholder="Text / SMS number"
                    value={addOpCell}
                    onChange={(e) => setAddOpCell(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="w-full rounded-md bg-gold py-2 text-sm font-medium text-ink"
                  onClick={saveNewOperator}
                >
                  Save & add to send
                </button>
              </div>
            )}
          </section>

          {selectedCandidates.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-cream">
                Send contacts ({selectedCandidates.length})
              </h2>
              <p className="text-xs text-muted">
                Email and SMS prefill from the operator profile when we have
                them — blank means add before send. Channel defaults to both
                unless the profile says otherwise.
              </p>
              <ul className="space-y-3">
                {selectedCandidates.map((c) => {
                  const profile = profileContactsForOperator(c.operator_id)
                  const ov = contactOverrides[c.operator_id] ?? profile
                  const loc =
                    listDeskOperators().find((o) => o.id === c.operator_id)
                      ?.base_icao ?? '—'
                  return (
                    <li
                      key={c.aircraft_id}
                      className="space-y-2 rounded-lg border border-gold/40 bg-gold/5 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-cream">
                            {c.operator_name}
                          </div>
                          <div className="text-xs text-muted">
                            Location{' '}
                            <span className="avionic text-cream">{loc}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-late"
                          onClick={() => {
                            setSelected((prev) => {
                              const next = new Set(prev)
                              next.delete(c.aircraft_id)
                              return next
                            })
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className={label}>
                          Email
                          <input
                            className={input}
                            type="email"
                            value={ov.contact_email}
                            placeholder="ops@operator.com"
                            onChange={(e) =>
                              patchOverride(c.operator_id, {
                                contact_email: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className={label}>
                          Text / SMS
                          <input
                            className={input}
                            value={ov.contact_cell}
                            placeholder="+1…"
                            onChange={(e) =>
                              patchOverride(c.operator_id, {
                                contact_cell: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div
                        className="flex rounded-lg border border-border bg-surface-2 p-0.5"
                        role="group"
                        aria-label="Quote link channel"
                      >
                        {(
                          [
                            ['both', 'Both'],
                            ['email', 'Email'],
                            ['sms', 'SMS'],
                          ] as const
                        ).map(([val, lab]) => (
                          <button
                            key={val}
                            type="button"
                            className={seg(ov.quote_link_channel === val)}
                            onClick={() =>
                              patchOverride(c.operator_id, {
                                quote_link_channel: val,
                              })
                            }
                          >
                            {lab}
                          </button>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

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
                            else {
                              next.add(id)
                              seedOverrideForCandidate(c)
                            }
                            return next
                          })
                        }}
                      />
                      <div>
                        <div className="font-medium text-cream">
                          {c.operator_name}
                        </div>
                        <div className="text-xs text-muted">
                          {listDeskOperators().find((o) => o.id === c.operator_id)
                            ?.base_icao ?? '—'}{' '}
                          · {c.label ?? 'option'} · confidence{' '}
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
              onClick={() => nav('/dispatch')}
              className="rounded-md border border-border px-4 py-2.5 text-sm text-muted"
            >
              Dispatch center
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const dimBox =
  'mt-1 w-full rounded-md border border-border bg-ink px-2 py-2.5 text-center avionic text-sm text-cream outline-none focus:border-gold placeholder:text-muted'

function StandardCargoFields({
  piecesText,
  onDimsChange,
}: {
  piecesText: string
  onDimsChange: (dims: StandardCargoDims) => void
}) {
  const dims = parseStandardCargoDims(piecesText)

  function patchDim(key: keyof StandardCargoDims, value: string) {
    onDimsChange({ ...dims, [key]: value })
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className={label}>
        Length (in)
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          className={dimBox}
          value={dims.length}
          placeholder={STANDARD_CARGO_DEFAULTS.length}
          onChange={(e) => patchDim('length', e.target.value)}
          aria-label="Standard cargo length inches"
        />
      </label>
      <label className={label}>
        Width (in)
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          className={dimBox}
          value={dims.width}
          placeholder={STANDARD_CARGO_DEFAULTS.width}
          onChange={(e) => patchDim('width', e.target.value)}
          aria-label="Standard cargo width inches"
        />
      </label>
      <label className={label}>
        Height (in)
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          className={dimBox}
          value={dims.height}
          placeholder={STANDARD_CARGO_DEFAULTS.height}
          onChange={(e) => patchDim('height', e.target.value)}
          aria-label="Standard cargo height inches"
        />
      </label>
      <label className={label}>
        Weight (lb)
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          className={dimBox}
          value={dims.weight}
          placeholder={STANDARD_CARGO_DEFAULTS.weight}
          onChange={(e) => patchDim('weight', e.target.value)}
          aria-label="Standard cargo weight pounds"
        />
      </label>
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
              {o.operator_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
