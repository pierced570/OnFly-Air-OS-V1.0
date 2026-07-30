import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SoftPricingPackageView } from '@/components/SoftPricingPackageView'
import {
  TripRequestForm,
  type PortalSubmitIntent,
} from '@/components/TripRequestForm'
import {
  emptyTripRequestDraft,
  type TripRequestDraft,
  type TripRequestRecord,
} from '@/domain/tripRequest'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import { getPortalClient } from '@/lib/clientOnboardStore'
import {
  buildSoftPricingForRequest,
  type SoftPricingPackageResult,
} from '@/lib/softPricingPackage'
import { requestHardQuote, submitTripRequest } from '@/lib/requestStore'

function draftFromRecord(row: TripRequestRecord): TripRequestDraft {
  return {
    email: row.email,
    client_id: row.client_id,
    client_name: row.client_name,
    timing: row.timing,
    direction: row.direction,
    hours_on_ground: row.hours_on_ground,
    service_mode: row.service_mode,
    legs: row.legs.map((l) => ({ ...l })),
    return_legs: row.return_legs.map((l) => ({ ...l })),
    cargo_only: row.cargo_only,
    pax: row.pax.map((p) => ({ ...p })),
    hazmat: row.hazmat,
    cargo_notes: row.cargo_notes,
    cargo_weight_lbs: row.cargo_weight_lbs,
    dim_unit: row.dim_unit,
    notes: row.notes,
    po_number: row.po_number,
    declared_value_usd: row.declared_value_usd,
    hard_deadline_at: row.hard_deadline_at,
    forklift_recommended: row.forklift_recommended,
    forklift_required: row.forklift_required,
    cargo_dims_status: row.cargo_dims_status,
    urgent_phone: row.urgent_phone,
  }
}

export default function PortalRequestPage() {
  const [done, setDone] = useState<TripRequestRecord | null>(null)
  const [intent, setIntent] = useState<PortalSubmitIntent | null>(null)
  const [softPackage, setSoftPackage] =
    useState<SoftPricingPackageResult | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [hardQuoteDone, setHardQuoteDone] = useState(false)
  /** When returning from soft quote, re-seed the form with that submit. */
  const [editDraft, setEditDraft] = useState<TripRequestDraft | null>(null)
  const [formKey, setFormKey] = useState(0)
  const client = getPortalClient()

  const initial = useMemo(() => {
    if (editDraft) return editDraft
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
  }, [client, editDraft])

  function editTripRequest() {
    if (done) {
      setEditDraft(draftFromRecord(done))
      setFormKey((k) => k + 1)
    }
    setDone(null)
    setIntent(null)
    setSoftPackage(null)
    setEstimating(false)
    setHardQuoteDone(false)
  }

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
      {
        // Soft quotes: email-only cost inquiry — no desk SMS.
        // Hard quote path notifies once via requestHardQuote.
        alert: mode === 'hard_quote' ? 'none' : 'cost_inquiry',
      },
    )
    setDone(row)
    setIntent(mode)
    setHardQuoteDone(false)
    setSoftPackage(null)

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
      const pkg = await buildSoftPricingForRequest(row)
      setSoftPackage(pkg)
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
      <WizardShell wide flushTop>
        {estimating && (
          <div className="mt-6 rounded-2xl bg-white px-5 py-8 text-sm text-muted">
            Building soft pricing across aircraft classes…
          </div>
        )}
        {!estimating && softPackage?.error && (
          <div className="mt-6 space-y-3 rounded-2xl bg-white p-5 text-ink sm:p-6">
            <h1 className="text-2xl font-semibold">Soft estimate</h1>
            <p className="text-sm text-late">{softPackage.error}</p>
            <p className="text-xs text-muted">
              Ref <span className="avionic text-ink">R-{done.ref}</span> ·{' '}
              {done.lane}
            </p>
            <button
              type="button"
              onClick={editTripRequest}
              className="text-sm font-semibold text-gold"
            >
              ← Edit trip request
            </button>
          </div>
        )}
        {!estimating &&
          softPackage &&
          !softPackage.error &&
          softPackage.classes.length > 0 && (
            <SoftPricingPackageView
              pkg={softPackage}
              requestRef={done.ref}
              lane={done.lane}
              onEditTrip={editTripRequest}
              hardQuoteDone={hardQuoteDone || Boolean(done.hard_quote_requested_at)}
              hardQuoteEmail={done.email || undefined}
              onHardQuote={() => {
                const updated = requestHardQuote(done.id)
                if (updated) {
                  setDone({ ...updated })
                  setHardQuoteDone(true)
                }
              }}
            />
          )}
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
            key={`${client?.id ?? 'anon'}-${formKey}`}
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

function WizardShell(props: {
  children: React.ReactNode
  wide?: boolean
  /** Soft-quote sticky banner sits flush to the viewport top. */
  flushTop?: boolean
}) {
  return (
    <div
      className="min-h-screen bg-[#F9F7F2] text-ink"
      data-theme="client"
    >
      <div
        className={[
          'mx-auto px-4 sm:px-6',
          props.flushTop ? 'pb-6 pt-0 sm:pb-8' : 'py-6 sm:py-8',
          props.wide ? 'max-w-6xl' : 'max-w-3xl sm:max-w-4xl',
        ].join(' ')}
      >
        {props.children}
      </div>
    </div>
  )
}
