import { useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
import {
  buildChangeRequestMailto,
  buildLogisticsQuoteOption,
  logisticsQuoteTitle,
} from '@/domain/clientLogisticsQuote'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from '@/domain/hardQuoteClientStatus'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'
import {
  acceptHardQuoteOption,
  declineHardQuote,
} from '@/lib/offerFlow'
import {
  getTripByAcceptToken,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export default function AcceptPage() {
  const { token } = useParams()
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = token ? getTripByAcceptToken(token) : null
  const [accepted, setAccepted] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [acceptedLabel, setAcceptedLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!trip || !trip.hard_quote) {
    return (
      <div className="min-h-screen bg-cream p-8 text-ink" data-theme="client">
        <p>This accept link is invalid or expired.</p>
      </div>
    )
  }

  const hq = trip.hard_quote
  const isPax = hq.payload_kind === 'pax' || hq.payload_kind === 'both'
  const status = hardQuoteClientStatus({
    trip_state: trip.state,
    client_decision: hq.client_decision,
    accepted_at: hq.accepted_at,
    declined_at: hq.declined_at,
  })
  const alreadyAccepted = accepted || status === 'accepted'
  const alreadyDeclined = declined || status === 'declined'
  const title = logisticsQuoteTitle(trip.lane)

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

  const options = rawOptions.map((opt) => {
    const offer = trip.offers.find((o) => o.id === opt.offer_id)
    return buildLogisticsQuoteOption({
      offer_id: opt.offer_id,
      label: opt.label,
      type_name: opt.type_name ?? offer?.type_name,
      time_to_position_min:
        opt.time_to_position_min ?? offer?.time_to_position_min,
      quick_turn_min:
        opt.quick_turn_min ?? offer?.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
      live_leg_min: opt.live_leg_min ?? offer?.live_leg_min,
      client_total: opt.client_total,
      lane: trip.lane,
      goAtIso: hq.sent_at ?? offer?.replied_at ?? null,
    })
  })

  return (
    <div className="min-h-screen bg-cream px-4 py-10 text-ink" data-theme="client">
      <div className="mx-auto max-w-lg space-y-6">
        <BrandLockup showTagline={false} />
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold leading-snug">{title}</h1>
          <p className="text-sm text-muted">
            Operated by a vetted Part 135 carrier
          </p>
        </header>

        <ul className="space-y-4">
          {options.map((opt) => (
            <li
              key={opt.offer_id}
              className="rounded-lg border border-border bg-white px-4 py-4 shadow-sm"
            >
              <div className="text-lg font-semibold">
                {opt.label}: {opt.aircraft_type}
              </div>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-muted">
                    Time to be in ({opt.departure_label}) from Go
                  </dt>
                  <dd className="mt-0.5">
                    <div className="avionic text-base font-medium">
                      {opt.position_eta.duration}
                    </div>
                    {opt.position_eta.clock ? (
                      <div className="avionic mt-0.5 text-sm text-muted">
                        ETA {opt.position_eta.clock}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">
                    Estimated loading and turn around time
                  </dt>
                  <dd className="mt-0.5">
                    <div className="avionic text-base font-medium">
                      {opt.etd.duration}
                    </div>
                    {opt.etd.clock ? (
                      <div className="avionic mt-0.5 text-sm text-muted">
                        ETD {opt.etd.clock}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">
                    Live leg time ({opt.departure_label} to{' '}
                    {opt.destination_label})
                  </dt>
                  <dd className="mt-0.5">
                    <div className="avionic text-base font-medium">
                      {opt.arrival_eta.duration}
                    </div>
                    {opt.etd.clock ? (
                      <div className="avionic mt-0.5 text-sm text-muted">
                        ETD {opt.etd.clock}
                      </div>
                    ) : null}
                    {opt.arrival_eta.clock ? (
                      <div className="avionic mt-0.5 text-sm text-muted">
                        ETA {opt.arrival_eta.clock}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div className="border-t border-border/70 pt-3">
                  <dt className="text-muted">Price</dt>
                  <dd className="avionic mt-0.5 text-3xl font-semibold text-ink">
                    {money(opt.price)}
                  </dd>
                  <p className="mt-1 text-xs text-muted">
                    {opt.taxes_fees_note}
                  </p>
                </div>
              </dl>

              {!alreadyAccepted && !alreadyDeclined ? (
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={busyId != null}
                    className="w-full rounded-md bg-gold py-3 text-sm font-semibold text-ink disabled:opacity-50"
                    onClick={() => {
                      setError(null)
                      setBusyId(opt.offer_id)
                      void acceptHardQuoteOption(token!, opt.offer_id)
                        .then(() => {
                          setAcceptedLabel(opt.label)
                          setAccepted(true)
                        })
                        .catch((e) =>
                          setError(
                            e instanceof Error ? e.message : String(e),
                          ),
                        )
                        .finally(() => setBusyId(null))
                    }}
                  >
                    {busyId === opt.offer_id ? 'Accepting…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId != null}
                    className="w-full rounded-md border border-border bg-cream py-3 text-sm font-medium text-ink disabled:opacity-50"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Deny this quote? We will release the aircraft hold.',
                        )
                      ) {
                        return
                      }
                      setError(null)
                      setBusyId(opt.offer_id)
                      void declineHardQuote(token!)
                        .then(() => setDeclined(true))
                        .catch((e) =>
                          setError(
                            e instanceof Error ? e.message : String(e),
                          ),
                        )
                        .finally(() => setBusyId(null))
                    }}
                  >
                    Deny
                  </button>
                  <a
                    className="w-full rounded-md border border-gold/40 bg-gold/10 py-3 text-center text-sm font-medium text-ink"
                    href={buildChangeRequestMailto({
                      lane: trip.lane,
                      optionLabel: opt.label,
                      acceptToken: hq.accept_token,
                    })}
                  >
                    Add details / Change request
                  </a>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {isPax && hq.disclosure_text ? (
          <div className="rounded-md border border-border bg-white p-4 text-sm">
            <div className="font-medium">Part 295.24 disclosure</div>
            <p className="mt-2 text-muted">{hq.disclosure_text}</p>
          </div>
        ) : null}

        {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}

        {alreadyAccepted ? (
          <div className="space-y-2 rounded-md border border-onplan/40 bg-onplan/10 p-4 text-onplan">
            <p>
              {hardQuoteClientStatusLabel('accepted')}
              {acceptedLabel ? ` · ${acceptedLabel}` : ''}.
            </p>
            <p className="text-sm text-muted">
              Mission is a go — a vetted Part 135 carrier is confirmed. Tracking
              and ETA updates will follow to your looped-in contacts.
            </p>
          </div>
        ) : null}

        {alreadyDeclined ? (
          <div className="space-y-2 rounded-md border border-border bg-white p-4">
            <p className="font-medium text-ink">
              {hardQuoteClientStatusLabel('declined')}
            </p>
            <p className="text-sm text-muted">
              Thanks — we won’t hold this aircraft. Use Add details / Change
              request if you still need a revised option.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
