import { useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
import { ClientLogisticsQuotePreview } from '@/components/ClientLogisticsQuotePreview'
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
        <ClientLogisticsQuotePreview
          title={title}
          options={options}
          interactive={!alreadyAccepted && !alreadyDeclined}
          disclosureText={isPax ? hq.disclosure_text : null}
          optionActions={(opt) => ({
            busy: busyId === opt.offer_id,
            onAccept: () => {
              setError(null)
              setBusyId(opt.offer_id)
              void acceptHardQuoteOption(token!, opt.offer_id)
                .then(() => {
                  setAcceptedLabel(opt.label)
                  setAccepted(true)
                })
                .catch((e) =>
                  setError(e instanceof Error ? e.message : String(e)),
                )
                .finally(() => setBusyId(null))
            },
            onDeny: () => {
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
                  setError(e instanceof Error ? e.message : String(e)),
                )
                .finally(() => setBusyId(null))
            },
            changeRequestHref: buildChangeRequestMailto({
              lane: trip.lane,
              optionLabel: opt.label,
              acceptToken: hq.accept_token,
            }),
          })}
        />

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
