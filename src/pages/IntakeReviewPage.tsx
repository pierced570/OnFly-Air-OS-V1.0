import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  acceptIntakeDraft,
  getIntakeDraft,
  ignoreIntakeDraft,
} from '@/lib/intakeStore'
import { submitTripRequest } from '@/lib/requestStore'
import { emptyTripRequestDraft } from '@/domain/tripRequest'

export default function IntakeReviewPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const draft = id ? getIntakeDraft(id) : undefined

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

  function acceptToBoard() {
    const base = emptyTripRequestDraft()
    const origin = String(draft!.extracted?.origin_text ?? '')
    const dest = String(draft!.extracted?.destination_text ?? '')
    const pieces = String(draft!.extracted?.pieces_text ?? '')
    submitTripRequest(
      {
        ...base,
        email: draft!.from.includes('@') ? draft!.from : '',
        client_name: draft!.from.split('@')[0] || 'Inbound',
        service_mode: 'd2d',
        cargo_notes: pieces,
        notes: [
          `Inbound ${draft!.channel} from ${draft!.from}`,
          draft!.body,
          origin || dest ? `Route text: ${origin} → ${dest}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        legs: [
          {
            ...base.legs[0]!,
            pickup_address: origin,
            dropoff_address: dest,
          },
        ],
      },
      'dispatch',
    )
    acceptIntakeDraft(draft!.id)
    nav('/')
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
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
        <pre className="mt-2 whitespace-pre-wrap text-sm text-cream">{draft.body}</pre>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase text-muted">Extracted (mock LLM)</h2>
        {draft.extracted ? (
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Origin</dt>
              <dd className="text-cream">{String(draft.extracted.origin_text ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-muted">Destination</dt>
              <dd className="text-cream">
                {String(draft.extracted.destination_text ?? '—')}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Pieces</dt>
              <dd className="text-cream">
                {String(draft.extracted.pieces_text ?? '—')}
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
            Mock SMS pinged on-shift: <span className="avionic">{draft.notified_phone}</span>
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        {draft.status === 'pending_review' && (
          <>
            <button
              type="button"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
              onClick={acceptToBoard}
            >
              Accept → Board request
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
