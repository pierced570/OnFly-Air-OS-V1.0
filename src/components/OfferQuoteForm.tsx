/**
 * Shared operator quote form — hrs/mins chain, Zulu+local, NET NET + fees.
 */

import { useMemo, useState } from 'react'
import {
  offerBtnPrimary,
  offerInput,
  offerLabel,
} from '@/components/OfferBoardChrome'
import { HrsMinsInput } from '@/components/HrsMinsInput'
import { isRoundTripLane } from '@/domain/offerMissionDisplay'
import {
  DEFAULT_QUICK_TURN_MIN,
  computeOfferQuoteTiming,
  type ZuluLocal,
} from '@/domain/offerQuoteTiming'
import type { FeeScope } from '@/lib/tripStore'
import { unifyAircraftType } from '@/lib/aircraftTypeCatalog'

export type OfferQuoteFormValues = {
  /** Aircraft type (e.g. Citation CJ3) — client-safe. */
  type_name: string
  /** Tail — desk / ops only; never shown on client quote. */
  tail: string
  time_to_position_min: number
  quick_turn_min: number
  live_leg_min: number
  price_net: number
  wait_ok: boolean
  max_wait_hrs: number | null
  fee_scope: FeeScope
}

type Props = {
  lane: string
  /** When omitted, inferred from multi-leg lane (outbound · return). */
  roundTrip?: boolean
  busy?: boolean
  submitLabel?: string
  /** Override the default operator intro; pass empty string to hide. */
  intro?: string
  /** Prefill when editing / desk entry. */
  initialTypeName?: string
  initialTail?: string
  initialPriceNet?: number
  initialTtpMin?: number
  initialQuickTurnMin?: number
  initialLiveLegMin?: number
  onSubmit: (values: OfferQuoteFormValues) => void
}

function TimeChip({
  title,
  place,
  times,
}: {
  title: string
  place: string
  times: ZuluLocal
}) {
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5 text-base text-gold">
      <div className="font-medium text-gold">{title}</div>
      {place ? (
        <div className="mt-0.5 text-sm text-gold/80">
          at <span className="avionic">{place}</span>
        </div>
      ) : null}
      <div className="mt-1.5 avionic text-cream">
        <span>{times.zulu}</span>
        <span className="mx-2 text-muted">·</span>
        <span>
          {times.local} {times.tzLabel}
        </span>
      </div>
    </div>
  )
}

export function OfferQuoteForm({
  lane,
  roundTrip,
  busy = false,
  submitLabel = 'Submit quote',
  intro = "You're available — enter your aircraft and quote:",
  initialTypeName = '',
  initialTail = '',
  initialPriceNet,
  initialTtpMin,
  initialQuickTurnMin,
  initialLiveLegMin,
  onSubmit,
}: Props) {
  const showWait = roundTrip ?? isRoundTripLane(lane)
  const [typeName, setTypeName] = useState(initialTypeName)
  const [tail, setTail] = useState(initialTail)
  const [ttp, setTtp] = useState(initialTtpMin ?? 90)
  const [quickTurn, setQuickTurn] = useState(
    initialQuickTurnMin ?? DEFAULT_QUICK_TURN_MIN,
  )
  const [live, setLive] = useState(initialLiveLegMin ?? 75)
  const [price, setPrice] = useState(initialPriceNet ?? 4500)
  const [waitOk, setWaitOk] = useState(true)
  const [maxWait, setMaxWait] = useState(2)
  /** Prefill: price includes all other fees. */
  const [feesIncluded, setFeesIncluded] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)

  const timing = useMemo(
    () =>
      computeOfferQuoteTiming({
        lane,
        timeToPositionMin: ttp,
        quickTurnMin: quickTurn,
        liveLegMin: live,
      }),
    [lane, ttp, quickTurn, live],
  )

  const typeHint = useMemo(() => {
    const raw = typeName.trim()
    if (!raw) return null
    const unified = unifyAircraftType(raw)
    if (!unified || unified.toLowerCase() === raw.toLowerCase()) return null
    return unified
  }, [typeName])

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const type = unifyAircraftType(typeName) || typeName.trim()
        const t = tail.trim().toUpperCase()
        if (!type) {
          setLocalError('Enter the aircraft type')
          return
        }
        if (!t) {
          setLocalError('Enter the tail you will fly')
          return
        }
        setLocalError(null)
        onSubmit({
          type_name: type,
          tail: t,
          time_to_position_min: ttp,
          quick_turn_min: quickTurn,
          live_leg_min: live,
          price_net: price,
          wait_ok: showWait ? waitOk : false,
          max_wait_hrs: showWait && waitOk ? maxWait : null,
          fee_scope: feesIncluded ? 'aircraft_and_fees' : 'aircraft_only',
        })
      }}
    >
      {intro ? <p className="text-base text-onplan">{intro}</p> : null}
      {localError && <p className="text-base text-late">{localError}</p>}

      <label className={offerLabel}>
        Aircraft type
        <input
          className={offerInput}
          value={typeName}
          onChange={(e) => setTypeName(e.target.value)}
          placeholder="Citation CJ3"
          required
          autoComplete="off"
        />
        {typeHint ? (
          <span className="mt-1 block font-mono text-sm text-gold">
            Saved as {typeHint}
          </span>
        ) : null}
      </label>

      <label className={offerLabel}>
        Tail number
        <input
          className={offerInput}
          value={tail}
          onChange={(e) => setTail(e.target.value.toUpperCase())}
          placeholder="N123AB"
          required
          autoCapitalize="characters"
          autoComplete="off"
        />
      </label>

      <HrsMinsInput
        label={`Time to be in (${timing.originIcao || 'departure'}) from Go`}
        totalMinutes={ttp}
        onChange={setTtp}
        required
      />
      <TimeChip
        title="In position"
        place={timing.originIcao || 'departure'}
        times={timing.positionAtOrigin}
      />

      <HrsMinsInput
        label="Estimated loading and turn around time"
        totalMinutes={quickTurn}
        onChange={setQuickTurn}
        required
      />
      <TimeChip
        title="Departure ETD"
        place={timing.originIcao || 'departure'}
        times={timing.etd}
      />

      <HrsMinsInput
        label={`Live leg time (${timing.originIcao || 'departure'} → ${timing.destIcao || 'destination'})`}
        totalMinutes={live}
        onChange={setLive}
        required
      />
      <TimeChip
        title="Arrival ETA"
        place={timing.destIcao || 'destination'}
        times={timing.destEta}
      />

      {showWait ? (
        <>
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={waitOk}
              onChange={(e) => setWaitOk(e.target.checked)}
            />
            Can do the wait time
          </label>
          {waitOk ? (
            <label className={offerLabel}>
              Max wait (hrs)
              <input
                type="number"
                inputMode="numeric"
                value={maxWait}
                onChange={(e) => setMaxWait(Number(e.target.value))}
                className={offerInput}
              />
            </label>
          ) : null}
        </>
      ) : null}

      <label className={offerLabel}>
        Price for Aircraft NET NET
        <span className="mt-0.5 block text-sm font-normal text-muted">
          OnFly adds tax on our end
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className={offerInput}
          required
        />
      </label>

      <div className="space-y-2">
        <div className="text-base text-cream">Other fees</div>
        <div
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-0.5"
          role="group"
          aria-label="Fee inclusion"
        >
          <button
            type="button"
            className={[
              'min-h-12 rounded-md px-3 py-3 text-left text-base font-medium',
              feesIncluded
                ? 'bg-gold text-ink'
                : 'bg-transparent text-muted hover:text-cream',
            ].join(' ')}
            onClick={() => setFeesIncluded(true)}
          >
            Price includes all other fees
          </button>
          <button
            type="button"
            className={[
              'min-h-12 rounded-md px-3 py-3 text-left text-base font-medium',
              !feesIncluded
                ? 'bg-gold text-ink'
                : 'bg-transparent text-muted hover:text-cream',
            ].join(' ')}
            onClick={() => setFeesIncluded(false)}
          >
            Price does not include other fees
          </button>
        </div>
      </div>

      <button type="submit" disabled={busy} className={offerBtnPrimary}>
        {busy ? 'Sending…' : submitLabel}
      </button>
    </form>
  )
}
