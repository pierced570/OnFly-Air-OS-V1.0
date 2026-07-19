import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TripRequestForm } from '@/components/TripRequestForm'
import {
  formatApproxHours,
  PORTAL_BAND_LABELS,
  type PortalEstimateOption,
} from '@/domain/portalEstimate'
import { emptyTripRequestDraft, type TripRequestRecord } from '@/domain/tripRequest'
import { getPortalClient } from '@/lib/clientOnboardStore'
import {
  estimatePortalRequest,
  type PortalRequestEstimate,
} from '@/lib/estimatePortalRequest'
import { requestHardQuote, submitTripRequest } from '@/lib/requestStore'

export default function PortalRequestPage() {
  const [done, setDone] = useState<TripRequestRecord | null>(null)
  const [estimate, setEstimate] = useState<PortalRequestEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [hardQuoteDone, setHardQuoteDone] = useState(false)
  const client = getPortalClient()

  const initial = useMemo(() => {
    const base = emptyTripRequestDraft()
    if (!client) return base
    const lane = client.profile.frequent_lanes?.[0]
    return {
      ...base,
      email: client.email || client.contacts.find((c) => c.role === 'requester')?.email || '',
      client_id: client.id,
      legs: lane
        ? [
            {
              ...base.legs[0],
              origin_icao: lane.origin,
              dest_icao: lane.destination,
            },
          ]
        : base.legs,
      hazmat: Boolean(
        client.rules.hazmat_allowed &&
          (client.profile.shipping_flags?.hazmat_sometimes ||
            client.rules.hazmat_notes),
      ),
    }
  }, [client])

  async function onSubmit(draft: Parameters<typeof submitTripRequest>[0]) {
    const row = submitTripRequest(
      {
        ...draft,
        email: draft.email || client?.email || '',
        client_id: draft.client_id || client?.id || '',
      },
      'portal',
    )
    setDone(row)
    setHardQuoteDone(false)
    setEstimating(true)
    setEstimate(null)
    try {
      const est = await estimatePortalRequest(row)
      setEstimate(est)
    } finally {
      setEstimating(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-cream text-ink" data-theme="client">
        <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly Air</div>
          <header>
            <h1 className="text-2xl font-semibold">Instant estimate</h1>
            <p className="mt-1 text-sm text-muted">
              Ref <span className="avionic text-ink">R-{done.ref}</span> · {done.lane}
            </p>
          </header>

          {estimating && (
            <p className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              Sizing nearby piston, turboprop, and jet options that fit your cargo…
            </p>
          )}

          {!estimating && estimate?.error && (
            <p className="rounded-md border border-late/40 bg-late/10 px-4 py-3 text-sm">
              {estimate.error}
            </p>
          )}

          {!estimating && estimate && !estimate.error && estimate.options.length > 0 && (
            <>
              <p className="text-base text-ink">{estimate.closest_blurb}</p>
              <p className="text-sm text-muted">{estimate.disclaimer}</p>
              <div className="space-y-4">
                {estimate.options.map((opt) => (
                  <EstimateCard key={opt.band} option={opt} />
                ))}
              </div>
            </>
          )}

          <section className="rounded-xl border border-gold/40 bg-gold/10 px-5 py-5">
            <h2 className="text-lg font-semibold text-ink">Want a hard quote?</h2>
            <p className="mt-2 text-sm text-muted">
              If you want a hard quote with real times and numbers for this, click{' '}
              <span className="font-semibold text-ink">HERE</span>.
            </p>
            {hardQuoteDone || done.hard_quote_requested_at ? (
              <p className="mt-4 text-sm text-ink">
                Hard quote requested — dispatch is pulling live availability. We’ll
                follow up at {done.email || 'your email'}.
              </p>
            ) : (
              <button
                type="button"
                className="mt-4 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:bg-ink/90"
                onClick={() => {
                  const updated = requestHardQuote(done.id)
                  if (updated) {
                    setDone({ ...updated })
                    setHardQuoteDone(true)
                  }
                }}
              >
                HERE — request hard quote
              </button>
            )}
          </section>

          <p className="text-sm text-muted">
            Dispatch also has your request ({done.summary}). Watch{' '}
            {done.email || 'your inbox'} for updates from a vetted Part 135 carrier.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/portal"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            >
              Back to portal
            </Link>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => {
                setDone(null)
                setEstimate(null)
                setHardQuoteDone(false)
              }}
            >
              Submit another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Link to="/portal" className="text-sm text-muted hover:text-ink">
          ← Portal
        </Link>
        {!client && (
          <p className="mt-3 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-ink">
            You can request a trip now. Tracking and invoice contacts come from the
            client setup link OnFly sends (not this portal).
          </p>
        )}
        {client && client.profile.frequent_lanes && client.profile.frequent_lanes.length > 1 && (
          <p className="avionic mt-3 text-xs text-muted">
            Saved lanes:{' '}
            {client.profile.frequent_lanes
              .map((l) => `${l.origin}→${l.destination}`)
              .join(' · ')}
          </p>
        )}
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-sm">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <h1 className="text-lg font-semibold">New Trip Request</h1>
            <Link to="/portal" className="text-muted hover:text-ink" aria-label="Close">
              ✕
            </Link>
          </header>
          <div className="px-5 py-5">
            <TripRequestForm
              key={client?.id ?? 'anon'}
              variant="portal"
              initial={initial}
              submitLabel="Get instant estimate"
              onSubmit={(draft) => {
                void onSubmit(draft)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function EstimateCard({ option }: { option: PortalEstimateOption }) {
  const t = option.timing
  return (
    <article
      className={[
        'rounded-xl border bg-surface-2 px-5 py-4',
        option.closest ? 'border-gold shadow-sm' : 'border-border',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-gold">
            {option.closest ? 'Closest · ' : ''}
            {PORTAL_BAND_LABELS[option.band]}
          </div>
          <h3 className="mt-1 text-lg font-semibold">{option.label}</h3>
          <p className="mt-1 text-sm text-muted">{option.assumption_blurb}</p>
        </div>
        <div className="text-right">
          <div className="avionic text-2xl font-semibold">
            ${Math.round(option.total).toLocaleString('en-US')}
          </div>
          <div className="text-xs text-muted">estimated total</div>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
        {t.to_airport_min != null && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">To airport</dt>
            <dd className="avionic mt-0.5">~{formatApproxHours(t.to_airport_min)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Reposition</dt>
          <dd className="avionic mt-0.5">~{formatApproxHours(t.reposition_min)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Live leg</dt>
          <dd className="avionic mt-0.5">~{formatApproxHours(t.live_leg_min)}</dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
        {option.price_lines.map((line) => (
          <li
            key={line.code}
            className={[
              'flex justify-between gap-4',
              line.code === 'TOTAL' ? 'font-semibold text-ink' : 'text-muted',
            ].join(' ')}
          >
            <span>{line.label}</span>
            <span className="avionic text-ink">
              {line.amount === 0 && line.code === 'FET_EXEMPT_MTOW'
                ? 'Exempt'
                : `$${line.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}
