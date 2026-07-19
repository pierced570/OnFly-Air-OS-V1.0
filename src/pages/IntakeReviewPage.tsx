import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatAirportShort } from '@/domain/airports'
import { emptyTripRequestDraft } from '@/domain/tripRequest'
import type { Candidate } from '@/domain/routing'
import {
  acceptIntakeDraft,
  getIntakeDraft,
  ignoreIntakeDraft,
} from '@/lib/intakeStore'
import {
  recommendForIntake,
  type IntakeRecommendation,
} from '@/lib/intakeRecommend'
import { submitTripRequest } from '@/lib/requestStore'

export default function IntakeReviewPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const draft = id ? getIntakeDraft(id) : undefined
  const [rec, setRec] = useState<IntakeRecommendation | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!draft || draft.status !== 'pending_review' || !draft.extracted) {
      setRec(null)
      return
    }
    let cancelled = false
    setBusy(true)
    void recommendForIntake(draft).then((r) => {
      if (!cancelled) {
        setRec(r)
        setBusy(false)
      }
    })
    return () => {
      cancelled = true
    }
    // Re-run when this intake id changes (Map row is stable until accept/ignore).
  }, [draft?.id, draft?.status, draft?.extracted])

  if (!draft) {
    return (
      <div className="p-8">
        <h1 className="text-xl text-cream">Intake not found</h1>
        <Link to="/intake" className="mt-4 inline-block text-gold">
          ← Intake
        </Link>
      </div>
    )
  }

  function buildRequest() {
    const base = emptyTripRequestDraft()
    const originText = String(draft!.extracted?.origin_text ?? '')
    const destText = String(draft!.extracted?.destination_text ?? '')
    const pieces = String(
      draft!.extracted?.pieces_text ?? draft!.extracted?.pieces ?? '',
    )
    const originIcao = rec?.origin?.icao ?? ''
    const destIcao = rec?.destination?.icao ?? ''
    return submitTripRequest(
      {
        ...base,
        email: draft!.from.includes('@') ? draft!.from : '',
        client_name: draft!.from.split('@')[0] || 'Inbound',
        service_mode: originIcao && destIcao ? 'a2a' : 'd2d',
        cargo_notes: pieces,
        notes: [
          `Inbound ${draft!.channel} from ${draft!.from}`,
          draft!.body,
          originText || destText
            ? `Route text: ${originText} → ${destText}`
            : '',
          rec?.candidates.length
            ? `Recommended: ${rec.candidates
                .slice(0, 3)
                .map(
                  (c) =>
                    `${c.label ?? 'opt'} ${c.operator_name} ${c.tail}`.trim(),
                )
                .join(' · ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        legs: [
          {
            ...base.legs[0]!,
            origin_icao: originIcao,
            dest_icao: destIcao,
            pickup_address: originText,
            dropoff_address: destText,
          },
        ],
      },
      'dispatch',
    )
  }

  function acceptToBoard() {
    buildRequest()
    acceptIntakeDraft(draft!.id)
    nav('/')
  }

  function acceptToQuote() {
    const row = buildRequest()
    if (rec?.candidates.length) {
      sessionStorage.setItem(
        'onfly_quote_draft',
        JSON.stringify({
          pieces: [],
          originText: rec.origin?.icao ?? '',
          destText: rec.destination?.icao ?? '',
          ready_at: row.ready_at,
          payloadKind: 'cargo',
          hazmat: Boolean(draft!.extracted?.hazmat),
          paxCount: 0,
          mode: 'a2a',
          candidates: rec.candidates,
          requestId: row.id,
          requestRef: row.ref,
          client_id: row.client_id,
        }),
      )
    }
    acceptIntakeDraft(draft!.id)
    nav(`/trips/new?request=${row.id}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:gap-6 sm:p-8">
      <header>
        <div className="text-xs uppercase tracking-[0.2em] text-gold">
          Intake review
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-cream">
          {draft.channel.toUpperCase()} from {draft.from}
        </h1>
        <p className="mt-1 text-sm text-muted">{draft.subject}</p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase text-muted">Raw</h2>
        <pre className="mt-2 whitespace-pre-wrap text-sm text-cream">
          {draft.body}
        </pre>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase text-muted">Extracted</h2>
        {draft.extracted ? (
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Origin</dt>
              <dd className="text-cream">
                {String(draft.extracted.origin_text ?? '—')}
                {rec?.origin && (
                  <span className="mt-0.5 block avionic text-xs text-gold">
                    → {formatAirportShort(rec.origin)}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Destination</dt>
              <dd className="text-cream">
                {String(draft.extracted.destination_text ?? '—')}
                {rec?.destination && (
                  <span className="mt-0.5 block avionic text-xs text-gold">
                    → {formatAirportShort(rec.destination)}
                  </span>
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Pieces</dt>
              <dd className="text-cream">
                {String(
                  draft.extracted.pieces_text ?? draft.extracted.pieces ?? '—',
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-late">
            {draft.ignore_reason || 'No extraction'}
          </p>
        )}
        {draft.notified_phone && (
          <p className="mt-3 text-xs text-muted">
            Mock SMS pinged on-shift:{' '}
            <span className="avionic">{draft.notified_phone}</span>
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase text-muted">
          Recommended operators
        </h2>
        {busy && (
          <p className="mt-2 text-sm text-muted">Scoring fleet…</p>
        )}
        {!busy && rec?.error && (
          <p className="mt-2 text-sm text-late">{rec.error}</p>
        )}
        {!busy && rec && !rec.error && !rec.candidates.length && (
          <p className="mt-2 text-sm text-muted">
            No candidates cleared hard filters — open Network or New trip to
            adjust.
          </p>
        )}
        {!busy && !!rec?.candidates.length && (
          <ul className="mt-3 space-y-2">
            {rec.candidates.slice(0, 5).map((c) => (
              <CandidateRow key={`${c.aircraft_id}-${c.label}`} c={c} />
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        {draft.status === 'pending_review' && (
          <>
            <button
              type="button"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
              disabled={busy}
              onClick={acceptToQuote}
            >
              Accept → Quote with recommendations
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold"
              onClick={acceptToBoard}
            >
              Accept → Board only
            </button>
            <button
              type="button"
              className="rounded-md border border-late/50 px-4 py-2 text-sm text-late"
              onClick={() => {
                ignoreIntakeDraft(draft.id)
                nav('/intake')
              }}
            >
              Ignore
            </button>
          </>
        )}
        <Link to="/intake" className="px-4 py-2 text-sm text-gold">
          ← Intake queue
        </Link>
      </div>
    </div>
  )
}

function CandidateRow({ c }: { c: Candidate }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-ink/40 px-3 py-2 text-sm">
      <div>
        <span className="text-[10px] uppercase tracking-wider text-gold">
          {c.label ?? 'option'}
        </span>
        <div className="font-medium text-cream">
          {c.operator_name}{' '}
          <span className="avionic text-muted">{c.tail}</span>
        </div>
        <div className="text-xs text-muted">{c.type_name ?? 'type TBD'}</div>
      </div>
      <div className="text-right avionic text-cream">
        ${Math.round(c.price).toLocaleString()}
        <div className="text-[11px] text-muted">
          cost ${Math.round(c.cost).toLocaleString()}
        </div>
      </div>
    </li>
  )
}
