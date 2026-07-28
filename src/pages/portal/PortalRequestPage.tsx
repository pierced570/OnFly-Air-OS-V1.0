import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TripRequestForm,
  type PortalSubmitIntent,
} from '@/components/TripRequestForm'
import {
  formatApproxHours,
  PORTAL_BAND_LABELS,
  type PortalEstimateOption,
} from '@/domain/portalEstimate'
import {
  emptyTripRequestDraft,
  type TripRequestDraft,
  type TripRequestRecord,
} from '@/domain/tripRequest'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { getPortalClient } from '@/lib/clientOnboardStore'
import {
  estimatePortalRequest,
  type PortalRequestEstimate,
} from '@/lib/estimatePortalRequest'
import { requestHardQuote, submitTripRequest } from '@/lib/requestStore'
import { BrandLockup } from '@/components/BrandLockup'

export default function PortalRequestPage() {
  const [done, setDone] = useState<TripRequestRecord | null>(null)
  const [intent, setIntent] = useState<PortalSubmitIntent | null>(null)
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
      email:
        client.email ||
        client.contacts.find((c) => c.role === 'requester')?.email ||
        '',
      client_id: client.id,
      client_name: client.name,
      urgent_phone: client.profile.front_desk_phone || '',
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

  async function onSubmit(draft: TripRequestDraft, submitIntent?: PortalSubmitIntent) {
    const mode: PortalSubmitIntent = submitIntent ?? 'estimate'
    const row = submitTripRequest(
      {
        ...draft,
        email: draft.email || client?.email || '',
        client_id: draft.client_id || client?.id || '',
        client_name: draft.client_name || client?.name || draft.client_name,
        po_number: '',
        declared_value_usd: '',
      },
      'portal',
    )
    setDone(row)
    setIntent(mode)
    setHardQuoteDone(false)
    setEstimate(null)

    if (mode === 'hard_quote') {
      const updated = requestHardQuote(row.id)
      if (updated) {
        setDone({ ...updated })
        setHardQuoteDone(true)
      }
      try {
        const { createRoutedTripFromRequest } = await import('@/lib/ladderFlow')
        await createRoutedTripFromRequest(updated ?? row)
      } catch (routeErr) {
        console.warn('[portal] routed trip deferred', routeErr)
      }
      return
    }

    setEstimating(true)
    try {
      try {
        const { createRoutedTripFromRequest } = await import('@/lib/ladderFlow')
        await createRoutedTripFromRequest(row)
      } catch (routeErr) {
        console.warn('[portal] routed trip deferred', routeErr)
      }
      const est = await estimatePortalRequest(row)
      setEstimate(est)
    } finally {
      setEstimating(false)
    }
  }

  if (done && intent === 'hard_quote') {
    return (
      <div className="min-h-screen bg-cream text-ink" data-theme="client">
        <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
          <BrandLockup showTagline={false} />
          <header>
            <h1 className="text-2xl font-semibold">Quote request received</h1>
            <p className="mt-1 text-sm text-muted">
              Ref <span className="avionic text-ink">R-{done.ref}</span> ·{' '}
              {done.lane}
            </p>
          </header>

          <section className="rounded-xl border border-gold/40 bg-gold/10 px-5 py-5">
            <p className="text-sm text-ink">
              Our team is working this now. Monitor{' '}
              <span className="font-medium">{done.email || 'your email'}</span>{' '}
              for questions and next steps — typical quote time is 10–15 minutes.
            </p>
            {done.urgent_phone?.trim() ? (
              <p className="mt-3 text-sm text-muted">
                Urgent reach-back on file:{' '}
                <span className="avionic text-ink">{done.urgent_phone}</span>
              </p>
            ) : null}
          </section>

          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-center text-sm font-semibold text-cream hover:bg-ink/90"
          >
            Call our 24/7 dispatch desk if you would like to speak with someone
            directly
          </a>
          <p className="text-center avionic text-sm text-muted">{BRAND_PHONE}</p>

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
                setIntent(null)
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

  if (done) {
    return (
      <div className="min-h-screen bg-cream text-ink" data-theme="client">
        <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
          <BrandLockup showTagline={false} />
          <header>
            <h1 className="text-2xl font-semibold">Ballpark estimate</h1>
            <p className="mt-1 text-sm text-muted">
              Ref <span className="avionic text-ink">R-{done.ref}</span> ·{' '}
              {done.lane}
            </p>
            {done.forklift?.level !== 'none' && done.forklift?.label && (
              <p
                className={[
                  'mt-2 text-sm font-medium',
                  done.forklift.level === 'required' ? 'text-late' : 'text-gold',
                ].join(' ')}
              >
                {done.forklift.label}
              </p>
            )}
          </header>

          {estimating && (
            <p className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              Sizing nearby piston, turboprop, and jet options that fit your
              cargo…
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
            <h2 className="text-lg font-semibold text-ink">
              Have OnFly Quote this NOW
            </h2>
            <p className="mt-2 text-sm text-muted">
              Ready for real times and numbers? Our team will begin working
              immediately — typical quote time takes 10–15 minutes. Monitor your
              email for questions and next steps.
            </p>
            {hardQuoteDone || done.hard_quote_requested_at ? (
              <>
                <p className="mt-4 text-sm text-ink">
                  Hard quote requested — dispatch is pulling live availability.
                  We’ll follow up at {done.email || 'your email'}.
                </p>
                <a
                  href={`tel:${BRAND_PHONE_E164}`}
                  className="mt-4 flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-center text-sm font-semibold text-cream hover:bg-ink/90"
                >
                  Call our 24/7 dispatch desk if you would like to speak with
                  someone directly
                </a>
                <p className="mt-2 text-center avionic text-sm text-muted">
                  {BRAND_PHONE}
                </p>
              </>
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
                Have OnFly Quote this NOW
              </button>
            )}
          </section>

          <p className="text-sm text-muted">
            Dispatch also has your request ({done.summary}). Watch{' '}
            {done.email || 'your inbox'} for updates from a vetted Part 135
            carrier.
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
                setIntent(null)
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
            You can request a trip now. Sign in on the portal home to see trips
            already moving for your company.
          </p>
        )}
        {client &&
          client.profile.frequent_lanes &&
          client.profile.frequent_lanes.length > 1 && (
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
              portalDualActions
              onSubmit={(draft, submitIntent) => {
                void onSubmit(draft, submitIntent)
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
            <dt className="text-xs uppercase tracking-wider text-muted">
              To airport
            </dt>
            <dd className="avionic mt-0.5">
              ~{formatApproxHours(t.to_airport_min)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">
            Reposition
          </dt>
          <dd className="avionic mt-0.5">
            ~{formatApproxHours(t.reposition_min)}
          </dd>
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
