import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ClientLogisticsQuotePreview } from '@/components/ClientLogisticsQuotePreview'
import {
  buildChangeRequestMailto,
  buildCharterMissionChips,
  buildLogisticsQuoteOption,
  finalizeLogisticsQuoteOptions,
  logisticsQuoteTitle,
} from '@/domain/clientLogisticsQuote'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from '@/domain/hardQuoteClientStatus'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'
import { resolveTripByAcceptToken } from '@/lib/db/hydrateTrips'
import { portalTrackingUrlForTrip } from '@/lib/etaSheetSender'
import {
  acceptHardQuoteOption,
  declineHardQuote,
} from '@/lib/offerFlow'
import {
  getTripByAcceptToken,
  listTripsStable,
  payloadKindOf,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'

export default function AcceptPage() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const [resolved, setResolved] = useState<TripStoreRow | null>(() =>
    token ? getTripByAcceptToken(token) : null,
  )
  const [loading, setLoading] = useState(() =>
    Boolean(token && !getTripByAcceptToken(token)),
  )
  const [accepted, setAccepted] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [acceptedLabel, setAcceptedLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [trackHref, setTrackHref] = useState<string | null>(null)
  /** Guards double-taps before React re-renders busy state. */
  const acceptLock = useRef(false)

  useEffect(() => {
    let cancelled = false
    const trimmed = (token ?? '').trim()
    if (!trimmed) {
      setResolved(null)
      setLoading(false)
      return
    }
    const local = getTripByAcceptToken(trimmed)
    if (local) {
      setResolved(local)
      setLoading(false)
      return
    }
    setLoading(true)
    void resolveTripByAcceptToken(trimmed)
      .then((hit) => {
        if (cancelled) return
        setResolved(hit)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // Stay in sync after accept/decline mutates the store.
  const live = token ? getTripByAcceptToken(token) : null
  const trip = live ?? resolved
  const highlightOptionId = searchParams.get('option')
  const hq = trip?.hard_quote ?? null

  const options = useMemo(() => {
    if (!trip || !hq) return []
    const rawOptions =
      hq.options?.length ?
        hq.options
      : [
          {
            offer_id: trip.offers.find((o) => o.state === 'selected')?.id ?? '_',
            label: 'Option A',
            client_total: hq.total,
            eta_end: trip.promised_delivery,
            fee_scope: null as null,
            type_name: null as string | null,
            time_to_position_min: null as number | null,
            quick_turn_min: null as number | null,
            live_leg_min: null as number | null,
          },
        ]
    return finalizeLogisticsQuoteOptions(
      rawOptions.map((opt, i) => {
        const offer = trip.offers.find((o) => o.id === opt.offer_id)
        return buildLogisticsQuoteOption({
          offer_id: opt.offer_id,
          label: opt.label,
          option_index: i,
          type_name: opt.type_name ?? offer?.type_name,
          time_to_position_min:
            opt.time_to_position_min ?? offer?.time_to_position_min,
          quick_turn_min:
            opt.quick_turn_min ?? offer?.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
          live_leg_min: opt.live_leg_min ?? offer?.live_leg_min,
          client_total: opt.client_total,
          lane: trip.lane,
          goAtIso: hq.sent_at ?? offer?.replied_at ?? null,
          pickup_location: trip.portal_pickup_address,
          dropoff_location: trip.portal_dropoff_address,
        })
      }),
    )
  }, [trip, hq])

  const status = trip
    ? hardQuoteClientStatus({
        trip_state: trip.state,
        client_decision: hq?.client_decision,
        accepted_at: hq?.accepted_at,
        declined_at: hq?.declined_at,
      })
    : 'pending'
  const alreadyAccepted = accepted || status === 'accepted'
  const alreadyDeclined = declined || status === 'declined'

  // One tracking link for the confirmation screen (do not recreate each render).
  useEffect(() => {
    if (!alreadyAccepted || !trip || trackHref) return
    setTrackHref(portalTrackingUrlForTrip(trip.id, 'client-accept@onflyair.com'))
  }, [alreadyAccepted, trip, trackHref])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ECE8DF] p-8 text-ink" data-theme="client">
        <p>Loading quote…</p>
      </div>
    )
  }

  if (!trip || !hq) {
    return (
      <div className="min-h-screen bg-[#ECE8DF] p-8 text-ink" data-theme="client">
        <p>This accept link is invalid or expired.</p>
        <p className="mt-2 text-sm text-muted">
          Ask OnFly dispatch to resend the quote — the link may not have saved
          when it was first emailed.
        </p>
      </div>
    )
  }

  const isPax = hq.payload_kind === 'pax' || hq.payload_kind === 'both'
  const title = logisticsQuoteTitle(trip.lane)
  const refLabel = (trip.code ?? '').trim() || null
  const lockedOptionLabel =
    acceptedLabel ||
    options.find((o) => o.offer_id === trip.offers.find((x) => x.state === 'selected')?.id)
      ?.option_number_label ||
    options[0]?.option_number_label ||
    null

  const missionChips = buildCharterMissionChips({
    payload_kind: hq.payload_kind ?? payloadKindOf(trip),
    payload_summary: trip.payload_summary,
    ready_label: trip.ready_label,
  })

  const orderedOptions = highlightOptionId
    ? [
        ...options.filter((o) => o.offer_id === highlightOptionId),
        ...options.filter((o) => o.offer_id !== highlightOptionId),
      ]
    : options

  function beginAccept(opt: { offer_id: string; option_number_label: string }) {
    if (acceptLock.current || busyId) return
    acceptLock.current = true
    setError(null)
    setBusyId(opt.offer_id)
    setAcceptedLabel(opt.option_number_label)
    // Optimistic confirmation — first tap must feel instant; book runs after.
    setAccepted(true)
    void acceptHardQuoteOption(token!, opt.offer_id).catch((e) => {
      const raw = e instanceof Error ? e.message : String(e)
      // Never show RingCentral / SMS plumbing to clients — booking may already
      // have succeeded; desk sees console.warn logs.
      if (/ringcentral|sms failed|send-sms|parameter \[from\]/i.test(raw)) {
        console.warn('[accept] suppressed client-facing notify error', raw)
        return
      }
      // Trip already booked — keep confirmation.
      if (/already|booked|cannot accept from state booked/i.test(raw)) {
        return
      }
      console.warn('[accept] failed', raw)
      acceptLock.current = false
      setAccepted(false)
      setBusyId(null)
      setError(raw)
    })
  }

  // Accepted — dedicated confirmation (same route, no quote re-show).
  if (alreadyAccepted) {
    return (
      <div
        className="min-h-screen bg-[#ECE8DF] px-4 py-8 text-ink"
        data-theme="client"
      >
        <div className="mx-auto max-w-xl">
          <div className="overflow-hidden rounded-xl border border-[#E5DFD0] bg-white shadow-sm">
            <header className="bg-[#0C0C0E] px-5 py-4 text-[#F7F2E3]">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-[#C9A227]">
                ONFLY AIR
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#F7F2E3]">
                Quote accepted
              </h1>
              <p className="mt-1 text-sm text-[#F7F2E3]/60">{title}</p>
            </header>
            <div className="space-y-4 px-5 py-5">
              <p className="text-sm leading-relaxed text-[#0C0C0E]">
                {lockedOptionLabel
                  ? `${lockedOptionLabel} is locked in.`
                  : 'Your option is locked in.'}{' '}
                A vetted Part 135 carrier is confirmed. Tracking and ETA updates
                go to your looped-in contacts.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  to="/portal"
                  className="inline-flex items-center justify-center rounded-lg bg-[#C9A227] px-4 py-2.5 text-sm font-semibold text-[#0C0C0E]"
                >
                  Go to portal
                </Link>
                {trackHref ? (
                  <a
                    href={trackHref}
                    className="inline-flex items-center justify-center rounded-lg border border-[#C9A227] bg-white px-4 py-2.5 text-sm font-semibold text-[#0C0C0E]"
                  >
                    Track this trip
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-[#ECE8DF] px-4 py-8 text-ink"
      data-theme="client"
    >
      <div className="mx-auto max-w-xl space-y-5">
        <ClientLogisticsQuotePreview
          title={title}
          options={orderedOptions}
          interactive={!alreadyDeclined}
          disclosureText={isPax ? hq.disclosure_text : null}
          refLabel={refLabel}
          missionChips={missionChips}
          optionActions={(opt) => ({
            busy: busyId === opt.offer_id,
            onAccept: () => beginAccept(opt),
            // Deny / change once below cards — avoid repeating on every option.
            onDeny: undefined,
            changeRequestHref: undefined,
          })}
          sharedActions={
            alreadyDeclined
              ? null
              : {
                  busy: Boolean(busyId),
                  onDeny: () => {
                    if (
                      !window.confirm(
                        'Deny this quote? We will release the aircraft hold.',
                      )
                    ) {
                      return
                    }
                    setError(null)
                    setBusyId('deny')
                    void declineHardQuote(token!)
                      .then(() => setDeclined(true))
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                      .finally(() => setBusyId(null))
                  },
                  changeRequestHref: buildChangeRequestMailto({
                    lane: trip.lane,
                    acceptToken: hq.accept_token,
                  }),
                }
          }
        />

        {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}

        {alreadyDeclined ? (
          <div className="space-y-2 rounded-md border border-[#E5DFD0] bg-white p-4">
            <p className="font-medium text-[#0C0C0E]">
              {hardQuoteClientStatusLabel('declined')}
            </p>
            <p className="text-sm text-[#6B6560]">
              Thanks — we won’t hold this aircraft. Use Add details / Change
              request if you still need a revised option.
            </p>
            <Link
              to="/portal"
              className="inline-flex text-sm font-semibold text-[#C9A227] underline"
            >
              Go to portal
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
