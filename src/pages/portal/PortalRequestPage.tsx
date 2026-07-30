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

  async function onSubmit(
    draft: TripRequestDraft,
    submitIntent?: PortalSubmitIntent,
  ) {
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
      <WizardShell>
        <h1 className="text-2xl font-semibold text-cream">
          Quote request received
        </h1>
        <p className="mt-1 text-sm text-cream/60">
          Ref <span className="avionic text-cream">R-{done.ref}</span> ·{' '}
          {done.lane}
        </p>
        <section className="mt-6 rounded-xl border border-gold/40 bg-gold/10 px-5 py-5 text-ink">
          <p className="text-sm">
            Our team is working this now. Monitor{' '}
            <span className="font-medium">{done.email || 'your email'}</span> for
            questions and next steps — typical quote time is 10–15 minutes.
          </p>
        </section>
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="mt-4 flex w-full items-center justify-center rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-gold"
        >
          Call 24-hr ops · {BRAND_PHONE}
        </a>
        <Link
          to="/portal"
          className="mt-4 inline-block text-sm font-semibold text-gold"
        >
          ← Portal
        </Link>
      </WizardShell>
    )
  }

  if (done) {
    return (
      <WizardShell>
        <div className="rounded-2xl bg-white p-5 text-ink sm:p-6">
          <h1 className="text-2xl font-semibold">Ballpark estimate</h1>
          <p className="mt-1 text-sm text-muted">
            Ref <span className="avionic text-ink">R-{done.ref}</span> ·{' '}
            {done.lane}
          </p>
          {estimating && (
            <p className="mt-4 text-sm text-muted">Sizing nearby options…</p>
          )}
          {!estimating && estimate && !estimate.error && estimate.options.length > 0 && (
            <div className="mt-4 space-y-4">
              <p className="text-base">{estimate.closest_blurb}</p>
              {estimate.options.map((opt) => (
                <EstimateCard key={opt.band} option={opt} />
              ))}
            </div>
          )}
          <section className="mt-6 rounded-xl border border-gold/40 bg-gold/10 px-5 py-5">
            <h2 className="text-lg font-semibold">Have OnFly quote this NOW</h2>
            {hardQuoteDone || done.hard_quote_requested_at ? (
              <p className="mt-2 text-sm">
                Hard quote requested — we&apos;ll follow up at{' '}
                {done.email || 'your email'}.
              </p>
            ) : (
              <button
                type="button"
                className="mt-4 w-full rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-gold"
                onClick={() => {
                  const updated = requestHardQuote(done.id)
                  if (updated) {
                    setDone({ ...updated })
                    setHardQuoteDone(true)
                  }
                }}
              >
                Have OnFly quote this NOW
              </button>
            )}
          </section>
          <Link
            to="/portal"
            className="mt-4 inline-block text-sm font-semibold text-gold"
          >
            ← Portal
          </Link>
        </div>
      </WizardShell>
    )
  }

  return (
    <WizardShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link to="/portal" className="font-semibold text-gold">
          ← Portal
        </Link>
        <p className="text-ink/70">
          Already moving?{' '}
          <Link to="/portal" className="font-semibold text-ink underline">
            Sign in on portal home
          </Link>
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 bg-ink px-5 py-5 text-cream sm:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Let&apos;s get your freight moving
            </h1>
            <p className="mt-1 text-sm text-cream/60">
              Three quick steps. Our team quotes in 10–15 minutes.
            </p>
          </div>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="inline-flex items-center gap-2 rounded-full border border-cream/15 bg-[#141414] px-3 py-1.5 text-[11px] text-cream/85"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#2E7D32]"
              aria-hidden
            />
            Dispatch online ·{' '}
            <span className="font-semibold text-gold">{BRAND_PHONE}</span>
          </a>
        </header>
        <div className="px-4 py-5 sm:px-6">
          <TripRequestForm
            key={client?.id ?? 'anon'}
            variant="portal"
            initial={initial}
            portalWizard
            onSubmit={(draft, submitIntent) => {
              void onSubmit(draft, submitIntent)
            }}
          />
        </div>
      </div>
    </WizardShell>
  )
}

function WizardShell(props: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-[#F9F7F2] text-ink"
      data-theme="client"
    >
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {props.children}
      </div>
    </div>
  )
}

function EstimateCard({ option }: { option: PortalEstimateOption }) {
  const t = option.timing
  return (
    <article
      className={[
        'rounded-xl border bg-[#F7F2E3]/50 px-5 py-4',
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
          <dt className="text-xs uppercase tracking-wider text-muted">
            Live leg
          </dt>
          <dd className="avionic mt-0.5">
            ~{formatApproxHours(t.live_leg_min)}
          </dd>
        </div>
      </dl>
    </article>
  )
}
