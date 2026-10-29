import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PortalAppNav } from '@/components/PortalAppNav'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import { SoftPricingPackageView } from '@/components/SoftPricingPackageView'
import { usePortalSession } from '@/hooks/usePortalSession'
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
import {
  getPortalClient,
  setPortalClientId,
} from '@/lib/clientOnboardStore'
import { getClient, type ClientProfile } from '@/lib/clientStore'
import { getPortalAuthSession } from '@/lib/portalAuth'
import {
  connectPortalRequestToSpine,
  getRequestSoftPackage,
  portalNextHrefAfterQuote,
  saveRequestSoftPackage,
} from '@/lib/portalRequestConnect'
import {
  buildSoftPricingForRequest,
  type SoftPricingPackageResult,
} from '@/lib/softPricingPackage'
import {
  getRequest,
  requestHardQuote,
  submitTripRequest,
} from '@/lib/requestStore'
import { portalRequestHelloLabel } from '@/domain/portalClientApp'

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
    pax_details_deferred: row.pax_details_deferred,
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
  const { signedIn, setSession, session, loading: authLoading } =
    usePortalSession()
  const [searchParams] = useSearchParams()
  const entryMode: 'quote' | 'book' =
    searchParams.get('mode') === 'book' ? 'book' : 'quote'
  const restoreId = searchParams.get('requestId')?.trim() || null
  const [done, setDone] = useState<TripRequestRecord | null>(null)
  const [intent, setIntent] = useState<PortalSubmitIntent | null>(null)
  const [softPackage, setSoftPackage] =
    useState<SoftPricingPackageResult | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [hardQuoteDone, setHardQuoteDone] = useState(false)
  /** Spine trip + track after soft/hard connect. */
  const [tripHref, setTripHref] = useState<string | null>(null)
  const [trackHref, setTrackHref] = useState<string | null>(null)
  /** When returning from soft quote, re-seed the form with that submit. */
  const [editDraft, setEditDraft] = useState<TripRequestDraft | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [sessionClient, setSessionClient] = useState<ClientProfile | undefined>()
  const onboardClient = getPortalClient()
  const client = onboardClient ?? sessionClient
  const companyHello = portalRequestHelloLabel(client?.name)
  const loginNext = encodeURIComponent(
    `/portal/request${entryMode === 'book' ? '?mode=book' : '?mode=quote'}`,
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await getPortalAuthSession()
      if (cancelled || !s?.clientId) return
      setPortalClientId(s.clientId)
      const c = getClient(s.clientId)
      if (!cancelled && c) setSessionClient(c)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Restore prior soft quote / hard-quote request from home or history.
  useEffect(() => {
    if (!restoreId) return
    const row = getRequest(restoreId)
    if (!row) return
    setDone(row)
    setIntent(row.hard_quote_requested_at ? 'hard_quote' : 'estimate')
    setHardQuoteDone(Boolean(row.hard_quote_requested_at))
    if (row.linked_trip_id) setTripHref(`/portal/trips/${row.linked_trip_id}`)
    if (row.track_token) setTrackHref(`/portal/track/${row.track_token}`)
    const pkg = getRequestSoftPackage(restoreId)
    if (pkg) setSoftPackage(pkg)
  }, [restoreId])

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
    setTripHref(null)
    setTrackHref(null)
  }

  async function linkSpine(row: TripRequestRecord) {
    const linked = await connectPortalRequestToSpine(row)
    if (!linked) return
    setTripHref(linked.tripHref)
    setTrackHref(linked.trackHref)
    const refreshed = getRequest(row.id)
    if (refreshed) setDone({ ...refreshed })
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
    setTripHref(null)
    setTrackHref(null)

    if (mode === 'hard_quote') {
      // Await RingOut (ring-desk) + desk email — do not open tel: on the client.
      const updated = await requestHardQuote(row.id)
      if (updated) {
        setDone({ ...updated })
        setHardQuoteDone(true)
      }
      await linkSpine(updated ?? row)
      return
    }

    setEstimating(true)
    try {
      await linkSpine(row)
      const pkg = await buildSoftPricingForRequest(row)
      setSoftPackage(pkg)
      if (!pkg.error) saveRequestSoftPackage(row.id, pkg)
    } finally {
      setEstimating(false)
    }
  }

  const afterQuoteHref = portalNextHrefAfterQuote({
    signedIn,
    tripHref,
    trackHref,
  })

  if (done && intent === 'hard_quote') {
    return (
      <WizardShell appNav={signedIn}>
        <h1 className="text-2xl font-semibold text-ink">
          Quote request received
        </h1>
        <p className="mt-1 text-sm text-muted">
          Ref <span className="avionic text-ink">R-{done.ref}</span> ·{' '}
          {done.lane}
        </p>
        <section className="mt-6 rounded-xl border border-gold/40 bg-gold/10 px-5 py-5 text-ink">
          <p className="text-sm">
            Your details went to the desk by email, and we&apos;re ringing{' '}
            <span className="avionic font-medium">{BRAND_PHONE}</span> now.
            We&apos;ll follow up at{' '}
            <span className="font-medium">{done.email || 'your email'}</span>.
            Typical quote time is 10–15 minutes.
          </p>
        </section>
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="mt-4 flex w-full flex-col items-center justify-center gap-0.5 rounded-lg bg-ink px-4 py-3 text-center text-sm font-semibold text-gold"
        >
          <span>Rather talk to a real person? Call now</span>
          <span className="text-xs font-normal text-gold/80">
            Dispatchers always on call ·{' '}
            <span className="avionic">{BRAND_PHONE}</span>
          </span>
        </a>
        {(tripHref || trackHref) && (
          <Link
            to={afterQuoteHref}
            className="mt-4 flex w-full items-center justify-center rounded-lg border border-gold/40 bg-white px-4 py-3 text-sm font-semibold text-ink"
          >
            Open trip &amp; tracking →
          </Link>
        )}
        {!signedIn && done.email?.includes('@') ? (
          <div className="mt-6">
            <PortalOneClickLogin
              email={done.email}
              onSignedIn={setSession}
              nextHref={afterQuoteHref}
              title="Open this trip on your phone"
              hint="Verified desk email — one tap, no password. Routes you to your company portal."
            />
          </div>
        ) : (
          <Link
            to="/portal"
            className="mt-4 inline-block text-sm font-semibold text-gold"
          >
            ← My trips
          </Link>
        )}
      </WizardShell>
    )
  }

  if (done) {
    return (
      <WizardShell wide flushTop appNav={signedIn}>
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
                void (async () => {
                  const updated = await requestHardQuote(done.id)
                  if (updated) {
                    setDone({ ...updated })
                    setHardQuoteDone(true)
                  }
                })()
              }}
            />
          )}
        {!estimating &&
        softPackage &&
        !softPackage.error &&
        (tripHref || trackHref) ? (
          <div className="mt-4 px-1 sm:px-0">
            <Link
              to={afterQuoteHref}
              className="flex w-full items-center justify-center rounded-lg border border-[#E5DFD0] bg-white px-4 py-3 text-sm font-semibold text-ink"
            >
              Open on My trips / tracking →
            </Link>
          </div>
        ) : null}
        {!signedIn &&
        done.email?.includes('@') &&
        !estimating &&
        softPackage &&
        !softPackage.error ? (
          <div className="mt-6 px-1 sm:px-0">
            <PortalOneClickLogin
              email={done.email}
              onSignedIn={setSession}
              nextHref={afterQuoteHref}
              title="Keep this quote on your trips list"
              hint="Verified desk email — one tap opens your company trips and this quote."
            />
          </div>
        ) : null}
      </WizardShell>
    )
  }

  return (
    <WizardShell appNav={signedIn}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link to="/portal" className="font-semibold text-gold">
          ← Portal
        </Link>
        {authLoading ? (
          <p className="text-ink/50">Checking session…</p>
        ) : signedIn ? (
          <p className="text-ink">
            <span className="font-semibold">{companyHello}</span>
            <span className="text-ink/50"> · </span>
            <Link
              to="/portal"
              className="font-semibold text-ink underline decoration-gold/60 underline-offset-2"
            >
              My trips
            </Link>
          </p>
        ) : (
          <p className="text-ink/70">
            Already moving?{' '}
            <Link
              to={`/portal/login?next=${loginNext}`}
              className="font-semibold text-ink underline"
            >
              Sign in
            </Link>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 bg-ink px-5 py-5 text-cream sm:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {signedIn && client?.name?.trim()
                ? `Request for ${client.name.trim()}`
                : entryMode === 'book'
                  ? "Let's get your freight moving"
                  : 'Get a rough quote'}
            </h1>
            <p className="mt-1 text-sm text-cream/60">
              {signedIn
                ? 'Three quick steps. Our team quotes in 10–15 minutes.'
                : entryMode === 'book'
                  ? 'Three quick steps. Our team quotes in 10–15 minutes — no login required.'
                  : 'Three quick steps. Soft pricing first, then push to a hard quote if it fits.'}
            </p>
            {signedIn && session?.email ? (
              <p className="mt-2 text-[11px] text-cream/45">
                Signed in as{' '}
                <span className="avionic text-cream/70">{session.email}</span>
              </p>
            ) : null}
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
            key={`${client?.id ?? 'anon'}-${formKey}-${entryMode}`}
            variant="portal"
            initial={initial}
            portalWizard
            portalEntryMode={entryMode}
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
  /** Signed-in client app bottom tabs (mobile). */
  appNav?: boolean
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
          props.appNav ? 'pb-28 md:pb-8' : '',
        ].join(' ')}
      >
        {props.children}
      </div>
      {props.appNav ? <PortalAppNav /> : null}
    </div>
  )
}
