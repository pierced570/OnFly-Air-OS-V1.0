/**
 * Inline "Send to new operator" on Dispatch center — recommend (top 3) +
 * search + quick-add, same shape as Parse & shortlist.
 */

import { useEffect, useMemo, useState } from 'react'
import { isSmsDeliveryEnabled } from '@/adapters/comms'
import { AirportSelect } from '@/components/AirportSelect'
import PhoneInput from '@/components/PhoneInput'
import { describeOfferDestination } from '@/domain/offerRecipients'
import {
  DEFAULT_QUOTE_LINK_CHANNEL,
  type QuoteLinkChannel,
} from '@/domain/quoteLinkChannel'
import type { Candidate } from '@/domain/routing'
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
import { appendOfferToTrip } from '@/lib/offerFlow'
import { updateSheetOperatorField } from '@/lib/networkSheetStore'
import { BUILTIN_RECOMMEND_MATRIX } from '@/domain/recommendMatrix'
import {
  deskDraftFromTrip,
  recommendForDeskDraft,
} from '@/lib/scratchDeskFlow'
import { getTrip } from '@/lib/tripStore'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold placeholder:text-muted'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'
const seg = (on: boolean) =>
  [
    'flex-1 rounded-md px-3 py-2.5 text-sm font-semibold',
    on ? 'bg-gold text-ink' : 'bg-transparent text-muted hover:text-cream',
  ].join(' ')

type Props = {
  tripId: string
  onClose: () => void
  onSent?: () => void
}

export function OfferAddOperatorPanel({ tripId, onClose, onSent }: Props) {
  const trip = getTrip(tripId)
  const already = useMemo(
    () =>
      new Set((trip?.offers ?? []).map((o) => o.operator_id).filter(Boolean)),
    [trip?.offers],
  )

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [extra, setExtra] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<
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
  const [recError, setRecError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [sending, setSending] = useState(false)

  const opHits = useMemo(
    () =>
      searchDeskOperators(opQuery, 8).filter((h) => !already.has(h.operator_id)),
    [opQuery, already, overrides],
  )

  // Mid-trip add-operator uses builtin shortlist size — not Network Recommend.
  const recommendLimit = BUILTIN_RECOMMEND_MATRIX.recommend_limit

  const recommended = useMemo(
    () =>
      candidates
        .filter((c) => !already.has(c.operator_id))
        .slice(0, recommendLimit),
    [candidates, already, recommendLimit],
  )

  const allCandidates = useMemo(() => {
    const seen = new Set<string>()
    const out: Candidate[] = []
    for (const c of [...recommended, ...extra]) {
      if (already.has(c.operator_id)) continue
      if (seen.has(c.operator_id)) continue
      seen.add(c.operator_id)
      out.push(c)
    }
    return out
  }, [recommended, extra, already])

  const selectedCandidates = useMemo(
    () => allCandidates.filter((c) => selected.has(c.aircraft_id)),
    [allCandidates, selected],
  )

  function profileContacts(operatorId: string): DeskContactOverride {
    const op = listDeskOperators().find((o) => o.id === operatorId)
    if (op) return contactOverrideFromHit(toDeskOperatorHit(op))
    return {
      contact_email: '',
      contact_cell: '',
      quote_link_channel: DEFAULT_QUOTE_LINK_CHANNEL,
    }
  }

  function seedOverride(hit: DeskOperatorHit) {
    setOverrides((prev) => {
      if (prev[hit.operator_id]) return prev
      return { ...prev, [hit.operator_id]: contactOverrideFromHit(hit) }
    })
  }

  function seedForCandidate(c: Candidate) {
    const op = listDeskOperators().find((o) => o.id === c.operator_id)
    if (op) seedOverride(toDeskOperatorHit(op))
    else {
      setOverrides((prev) => {
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

  function patchOverride(
    operatorId: string,
    patch: Partial<DeskContactOverride>,
  ) {
    setOverrides((prev) => {
      const cur = prev[operatorId] ?? profileContacts(operatorId)
      return { ...prev, [operatorId]: { ...cur, ...patch } }
    })
  }

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError(null)
    void ensureDeskOperatorsLoaded()
      .then(async () => {
        const t = getTrip(tripId)
        if (!t || cancelled) return
        const draft = deskDraftFromTrip(t)
        const rec = await recommendForDeskDraft(draft)
        if (cancelled) return
        setCandidates(
          rec.candidates.slice(0, BUILTIN_RECOMMEND_MATRIX.recommend_limit),
        )
        setRecError(rec.error ?? null)
      })
      .catch((e) => {
        if (!cancelled) {
          setRecError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  function toggleCandidate(c: Candidate) {
    const id = c.aircraft_id
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        for (const other of allCandidates) {
          if (
            other.operator_id === c.operator_id &&
            other.aircraft_id !== id
          ) {
            next.delete(other.aircraft_id)
          }
        }
        next.add(id)
        seedForCandidate(c)
      }
      return next
    })
  }

  function addHit(hit: DeskOperatorHit) {
    if (already.has(hit.operator_id)) {
      setError(`${hit.name} already has this request`)
      return
    }
    const cand = candidateFromDeskHit(hit)
    setExtra((prev) => {
      if (prev.some((c) => c.operator_id === cand.operator_id)) return prev
      return [...prev, cand]
    })
    setSelected((prev) => new Set(prev).add(cand.aircraft_id))
    seedOverride(hit)
    setOpQuery('')
    setError(null)
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
      addHit(hit)
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

  async function send() {
    const t = getTrip(tripId)
    if (!t) {
      setError('Trip not found')
      return
    }
    const picks = allCandidates.filter((c) => selected.has(c.aircraft_id))
    if (!picks.length) {
      setError('Select at least one operator')
      return
    }
    const overridesForSend: Record<string, DeskContactOverride> = {}
    for (const c of picks) {
      overridesForSend[c.operator_id] =
        overrides[c.operator_id] ?? profileContacts(c.operator_id)
    }
    const smsLive = isSmsDeliveryEnabled()
    const undeliverable = picks.filter((c) => {
      const ov = overridesForSend[c.operator_id]!
      return !describeOfferDestination(
        {
          operator_name: c.operator_name,
          ...ov,
        },
        { smsDeliveryEnabled: smsLive },
      ).can_notify
    })
    if (undeliverable.length) {
      setError(
        smsLive
          ? `Add email or SMS on file before sending: ${undeliverable
              .map((c) => c.operator_name)
              .join(', ')}`
          : `Add an email on file before sending (SMS not connected): ${undeliverable
              .map((c) => c.operator_name)
              .join(', ')}`,
      )
      return
    }
    setSending(true)
    setError(null)
    try {
      for (const c of picks) {
        const ov = overridesForSend[c.operator_id]!
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
        await appendOfferToTrip(tripId, c, ov)
      }
      onSent?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  if (!trip) {
    return (
      <p className="mt-3 text-sm text-late">Trip not found in this session.</p>
    )
  }

  return (
    <div className="mt-3 space-y-4 rounded-md border border-gold/40 bg-gold/5 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-cream">
            Send to new operator
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Top {recommendLimit} recommend, search, or add new. Quote-request
            link goes out on the operator&apos;s channel (email and/or SMS).
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-muted hover:text-cream"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {error ? <p className="text-sm text-late">{error}</p> : null}
      {busy ? (
        <p className="text-sm text-muted">Loading recommended operators…</p>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Search operators
          </h3>
          <button
            type="button"
            className="text-xs text-gold hover:text-gold-lt"
            onClick={() => setShowAddOp((v) => !v)}
          >
            {showAddOp ? 'Cancel' : '+ Add new operator'}
          </button>
        </div>
        <input
          value={opQuery}
          onChange={(e) => setOpQuery(e.target.value)}
          placeholder="Search operator name, base, email, SMS…"
          className={input}
        />
        {opHits.length > 0 ? (
          <ul className="divide-y divide-border/60 rounded-md border border-border bg-ink">
            {opHits.map((h) => (
              <li key={h.operator_id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface/60"
                  onClick={() => addHit(h)}
                >
                  <span>
                    <span className="block text-sm text-cream">{h.name}</span>
                    <span className="text-xs text-muted">
                      {[h.base_icao, h.contact_email, h.contact_cell]
                        .filter(Boolean)
                        .join(' · ') || 'No contact on file'}
                    </span>
                  </span>
                  <span className="text-xs text-gold">Add →</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {showAddOp ? (
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                className={input}
                type="email"
                placeholder="Email"
                value={addOpEmail}
                onChange={(e) => setAddOpEmail(e.target.value)}
              />
              <PhoneInput
                className={input}
                placeholder="(555) 555-5555"
                value={addOpCell}
                onChange={setAddOpCell}
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
        ) : null}
      </section>

      {selectedCandidates.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Offer destinations ({selectedCandidates.length})
          </h3>
          <ul className="space-y-3">
            {selectedCandidates.map((c) => {
              const ov =
                overrides[c.operator_id] ?? profileContacts(c.operator_id)
              const loc =
                listDeskOperators().find((o) => o.id === c.operator_id)
                  ?.base_icao ?? '—'
              return (
                <li
                  key={c.aircraft_id}
                  className="space-y-2 rounded-lg border border-border bg-ink/50 p-3"
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
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          next.delete(c.aircraft_id)
                          return next
                        })
                      }
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
                      <PhoneInput
                        className={input}
                        value={ov.contact_cell}
                        placeholder="(555) 555-5555"
                        onChange={(digits) =>
                          patchOverride(c.operator_id, {
                            contact_cell: digits,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div
                    className="flex rounded-lg border border-border bg-surface p-0.5"
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
                            quote_link_channel: val as QuoteLinkChannel,
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
          <button
            type="button"
            disabled={sending || !selected.size}
            onClick={() => void send()}
            className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
          >
            {sending
              ? 'Sending…'
              : `Send offer request to ${selected.size} operator${
                  selected.size === 1 ? '' : 's'
                }`}
          </button>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          Recommended operators
        </h3>
        <p className="text-xs text-muted">
          Top {recommendLimit} (cheapest / fastest / best). Already on this
          request are hidden. Uses fixed defaults — not the editable
          new-request scoring knobs.
        </p>
        {recError ? <p className="text-sm text-late">{recError}</p> : null}
        {!busy && !recommended.length && !recError ? (
          <p className="text-sm text-muted">
            No recommendations — search or add a new operator above.
          </p>
        ) : null}
        <ul className="space-y-2">
          {recommended.map((c) => {
            const id = c.aircraft_id
            const on = selected.has(id)
            const base =
              listDeskOperators().find((o) => o.id === c.operator_id)
                ?.base_icao ?? '—'
            const tailBit =
              c.tail && c.tail !== 'TBD'
                ? ` · best fit ${c.tail}${c.type_name ? ` ${c.type_name}` : ''}`
                : c.type_name
                  ? ` · ${c.type_name}`
                  : ''
            return (
              <li
                key={c.operator_id}
                className={[
                  'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3',
                  on ? 'border-gold/50 bg-gold/10' : 'border-border bg-ink/40',
                ].join(' ')}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={on}
                    onChange={() => toggleCandidate(c)}
                  />
                  <div>
                    <div className="font-medium text-cream">
                      {c.operator_name}
                    </div>
                    <div className="text-xs text-muted">
                      <span className="avionic">{base}</span>
                      {tailBit} · {c.label ?? 'option'}
                      {typeof c.confidence === 'number' ? (
                        <>
                          {' '}
                          · confidence{' '}
                          <span className="avionic">
                            {(c.confidence * 100).toFixed(0)}%
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
