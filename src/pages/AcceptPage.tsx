import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ClientLogisticsQuotePreview } from '@/components/ClientLogisticsQuotePreview'
import { PortalGlassGuestShell } from '@/components/PortalGlassGuestShell'
import {
  buildChangeRequestMailto,
} from '@/domain/clientLogisticsQuote'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from '@/domain/hardQuoteClientStatus'
import { buildPortalTripQuoteBundle } from '@/domain/portalTripQuotes'
import { resolveTripByAcceptToken } from '@/lib/db/hydrateTrips'
import { portalTrackingUrlForTrip } from '@/lib/etaSheetSender'
import {
  acceptHardQuoteOption,
  declineHardQuote,
} from '@/lib/offerFlow'
import {
  getTripByAcceptToken,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

export default function AcceptPage() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const [resolved, setResolved] = useState(() =>
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
  const bundle = useMemo(() => buildPortalTripQuoteBundle(trip), [trip])

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

  useEffect(() => {
    if (!alreadyAccepted || !trip || trackHref) return
    setTrackHref(portalTrackingUrlForTrip(trip.id, 'client-accept@onflyair.com'))
  }, [alreadyAccepted, trip, trackHref])

  if (loading) {
    return (
      <PortalGlassGuestShell kicker="Quote" title="Loading quote…">
        <p className="g-body">One moment while we pull your options.</p>
      </PortalGlassGuestShell>
    )
  }

  if (!trip || !hq || !bundle) {
    return (
      <PortalGlassGuestShell
        kicker="Quote"
        title="Link unavailable"
        subtitle="Ask OnFly dispatch to resend the quote — the link may not have saved when it was first emailed."
      >
        <Link to="/" className="g-btn" style={{ textDecoration: 'none' }}>
          Back to portal
        </Link>
      </PortalGlassGuestShell>
    )
  }

  const isPax = hq.payload_kind === 'pax' || hq.payload_kind === 'both'
  const lockedOptionLabel =
    acceptedLabel ||
    bundle.options.find(
      (o) => o.offer_id === trip.offers.find((x) => x.state === 'selected')?.id,
    )?.option_number_label ||
    bundle.options[0]?.option_number_label ||
    null

  const orderedOptions = highlightOptionId
    ? [
        ...bundle.options.filter((o) => o.offer_id === highlightOptionId),
        ...bundle.options.filter((o) => o.offer_id !== highlightOptionId),
      ]
    : bundle.options

  function beginAccept(opt: { offer_id: string; option_number_label: string }) {
    if (acceptLock.current || busyId) return
    acceptLock.current = true
    setError(null)
    setBusyId(opt.offer_id)
    setAcceptedLabel(opt.option_number_label)
    setAccepted(true)
    void acceptHardQuoteOption(token!, opt.offer_id).catch((e) => {
      const raw = e instanceof Error ? e.message : String(e)
      if (/ringcentral|sms failed|send-sms|parameter \[from\]/i.test(raw)) {
        console.warn('[accept] suppressed client-facing notify error', raw)
        return
      }
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

  if (alreadyAccepted) {
    return (
      <PortalGlassGuestShell
        kicker="Confirmed"
        title="Quote accepted"
        subtitle={bundle.title}
      >
        <div className="g-panel g-panel--dense" style={{ padding: 18 }}>
          <p className="g-body" style={{ margin: 0 }}>
            {lockedOptionLabel
              ? `${lockedOptionLabel} is locked in.`
              : 'Your option is locked in.'}{' '}
            A vetted Part 135 carrier is confirmed. Tracking and ETA updates go
            to your looped-in contacts.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 16,
            }}
          >
            <Link to="/" className="g-btn" style={{ textDecoration: 'none' }}>
              Go to portal
            </Link>
            {trackHref ? (
              <a href={trackHref} className="g-ghost" style={{ textDecoration: 'none' }}>
                Track this trip
              </a>
            ) : null}
          </div>
        </div>
      </PortalGlassGuestShell>
    )
  }

  return (
    <PortalGlassGuestShell
      kicker="Hard quote"
      subtitle="Same options as your email — Accept, Deny, or request a change."
      backHref="/"
      backLabel="Portal"
    >
      <div className="space-y-4">
        <ClientLogisticsQuotePreview
          title={bundle.title}
          options={orderedOptions}
          interactive={!alreadyDeclined}
          disclosureText={isPax ? hq.disclosure_text : null}
          refLabel={bundle.refLabel}
          missionChips={bundle.missionChips}
          optionActions={(opt) => ({
            busy: busyId === opt.offer_id,
            onAccept: () => beginAccept(opt),
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

        {error ? (
          <p className="g-body" style={{ color: 'var(--ofa-red)' }}>
            {error}
          </p>
        ) : null}

        {alreadyDeclined ? (
          <div className="g-panel g-panel--dense" style={{ padding: 16 }}>
            <p style={{ margin: 0, fontWeight: 500, color: 'var(--ofa-ink)' }}>
              {hardQuoteClientStatusLabel('declined')}
            </p>
            <p className="g-body" style={{ marginTop: 8 }}>
              Thanks — we won’t hold this aircraft. Use Add details / Change
              request if you still need a revised option.
            </p>
            <Link
              to="/"
              className="g-btn g-btn--sm"
              style={{ marginTop: 12, textDecoration: 'none', display: 'inline-flex' }}
            >
              Go to portal
            </Link>
          </div>
        ) : null}
      </div>
    </PortalGlassGuestShell>
  )
}
