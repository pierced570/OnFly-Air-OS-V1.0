/**
 * Shared operator quote form — hrs/mins chain + price + fees.
 * `variant="operator"` = cream mockup UI for public Yes→quote.
 * `variant="desk"` = compact dark form for dispatcher workbench.
 */

import { useMemo, useState } from 'react'
import {
  offerBtnPrimary,
  offerInput,
  offerLabel,
} from '@/components/OfferBoardChrome'
import { HrsMinsInput } from '@/components/HrsMinsInput'
import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import {
  buildOfferMissionBadges,
  isRoundTripLane,
  offerLaneTitle,
  parseLaneAirports,
} from '@/domain/offerMissionDisplay'
import {
  DEFAULT_QUICK_TURN_MIN,
  REFERENCE_LIVE_LEG_MIN,
  REFERENCE_TTP_MIN,
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
  notes: string | null
  /** Roundtrip: crew duty remaining today (minutes). */
  duty_available_min: number | null
  /** Roundtrip: duty covered by this quote (minutes). */
  duty_included_min: number | null
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
  initialNotes?: string
  initialDutyAvailableMin?: number
  initialDutyIncludedMin?: number
  /** Cream public form vs dark desk workbench. */
  variant?: 'operator' | 'desk'
  /** Mission header (operator variant). */
  tripCode?: string
  payloadSummary?: string
  readyLabel?: string
  liveNm?: number | null
  onDecline?: () => void
  onSubmit: (values: OfferQuoteFormValues) => void
}

const creamInput =
  'mt-1.5 w-full min-h-12 rounded-xl border border-[#D9D2C3] bg-white px-3 py-3 text-base text-ink outline-none focus:border-gold placeholder:text-[#9A9285]'
const creamLabel = 'block text-sm font-medium text-ink'
const creamHrs =
  'mt-1 w-full min-h-11 rounded-lg border border-[#D9D2C3] bg-white px-2 py-2 text-center text-base text-ink avionic outline-none focus:border-gold placeholder:text-[#9A9285]'

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

function CreamTimeRow({
  title,
  hint,
  totalMinutes,
  placeholderTotalMinutes,
  onChange,
}: {
  title: string
  hint: string
  totalMinutes: number | null
  /** Grey reference values until the operator enters their own. */
  placeholderTotalMinutes: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8E1D4] py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-[#6F675C]">{hint}</p>
      </div>
      <div className="w-[11.5rem] shrink-0">
        <HrsMinsInput
          label="Duration"
          totalMinutes={totalMinutes}
          placeholderTotalMinutes={placeholderTotalMinutes}
          onChange={onChange}
          required
          labelClassName="sr-only"
          inputClassName={creamHrs}
          unitPlacement="below"
        />
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
  initialNotes = '',
  initialDutyAvailableMin,
  initialDutyIncludedMin,
  variant = 'desk',
  tripCode,
  payloadSummary = '',
  readyLabel = '',
  liveNm = null,
  onDecline,
  onSubmit,
}: Props) {
  const showWait = roundTrip ?? isRoundTripLane(lane)
  const operatorEmptyTimes = variant === 'operator'
  const [typeName, setTypeName] = useState(initialTypeName)
  const [tail, setTail] = useState(initialTail)
  // Operator: start empty with grey reference placeholders — they enter their own.
  // Desk: keep working defaults so dispatchers can quote quickly.
  const [ttp, setTtp] = useState<number | null>(
    initialTtpMin ?? (operatorEmptyTimes ? null : REFERENCE_TTP_MIN),
  )
  const [quickTurn, setQuickTurn] = useState<number | null>(
    initialQuickTurnMin ??
      (operatorEmptyTimes ? null : DEFAULT_QUICK_TURN_MIN),
  )
  const [live, setLive] = useState<number | null>(
    initialLiveLegMin ?? (operatorEmptyTimes ? null : REFERENCE_LIVE_LEG_MIN),
  )
  const [priceText, setPriceText] = useState(
    initialPriceNet != null ? String(initialPriceNet) : '',
  )
  const [waitOk, setWaitOk] = useState(true)
  const [maxWaitText, setMaxWaitText] = useState('2')
  const [feesIncluded, setFeesIncluded] = useState(true)
  const [notes, setNotes] = useState(initialNotes)
  const [dutyAvail, setDutyAvail] = useState(initialDutyAvailableMin ?? 0)
  const [dutyIncl, setDutyIncl] = useState(initialDutyIncludedMin ?? 0)
  const [localError, setLocalError] = useState<string | null>(null)

  const timing = useMemo(
    () =>
      computeOfferQuoteTiming({
        lane,
        timeToPositionMin: ttp ?? REFERENCE_TTP_MIN,
        quickTurnMin: quickTurn ?? DEFAULT_QUICK_TURN_MIN,
        liveLegMin: live ?? REFERENCE_LIVE_LEG_MIN,
      }),
    [lane, ttp, quickTurn, live],
  )

  const originIcao = timing.originIcao || parseLaneAirports(lane)?.origin || ''
  const destIcao = timing.destIcao || parseLaneAirports(lane)?.dest || ''

  function submitForm() {
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
    const price = Math.round(Number(priceText.replace(/,/g, '')))
    if (!Number.isFinite(price) || !(price > 0)) {
      setLocalError('Enter a price greater than zero')
      return
    }
    if (ttp == null || quickTurn == null || live == null) {
      setLocalError(
        'Enter your times for position, turn, and live leg (grey numbers are reference only)',
      )
      return
    }
    if (!(live > 0)) {
      setLocalError('Live leg must be greater than zero')
      return
    }
    const maxWait = Math.max(0, Number(maxWaitText) || 0)
    const dutyAvailable =
      showWait && variant === 'operator' ? Math.max(0, dutyAvail) : null
    const dutyIncluded =
      showWait && variant === 'operator' ? Math.max(0, dutyIncl) : null
    setLocalError(null)
    onSubmit({
      type_name: type,
      tail: t,
      time_to_position_min: ttp,
      quick_turn_min: quickTurn,
      live_leg_min: live,
      price_net: price,
      wait_ok:
        showWait && variant === 'operator'
          ? (dutyIncluded ?? 0) > 0 || (dutyAvailable ?? 0) > 0
          : showWait
            ? waitOk
            : false,
      max_wait_hrs:
        showWait && variant === 'operator'
          ? dutyIncluded != null && dutyIncluded > 0
            ? Math.round((dutyIncluded / 60) * 10) / 10
            : null
          : showWait && waitOk
            ? maxWait
            : null,
      fee_scope: feesIncluded ? 'aircraft_and_fees' : 'aircraft_only',
      notes: notes.trim() || null,
      duty_available_min: dutyAvailable,
      duty_included_min: dutyIncluded,
    })
  }

  if (variant === 'operator') {
    const title = offerLaneTitle({ lane, payload_summary: payloadSummary })
    const badges = buildOfferMissionBadges({
      lane,
      payload_summary: payloadSummary,
      ready_label: readyLabel,
      nm: liveNm,
    })
    const code = (tripCode || '').trim() || 'QUOTE'

    return (
      <form
        className="overflow-hidden rounded-2xl border border-[#E4DDD0] bg-white shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          submitForm()
        }}
      >
        <header className="bg-[#141414] px-5 pb-6 pt-5 text-cream sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <img
              src={BRAND_LOGO_PATH}
              alt="OnFly Air"
              className="h-8 w-auto object-contain sm:h-9"
            />
            <span className="avionic rounded-full border border-gold/50 px-2.5 py-1 text-[10px] tracking-wide text-gold">
              QUOTE REQUEST · {code}
            </span>
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.map((b) => (
              <span
                key={b.label}
                className={[
                  'avionic rounded-full px-2.5 py-1 text-[10px] tracking-wide',
                  b.emphasis === 'gold'
                    ? 'border border-gold/50 text-gold'
                    : 'bg-[#0C0C0E] text-cream/85',
                ].join(' ')}
              >
                {b.label}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-cream/75">
            Reply with your times and price below — takes about a minute.
            Questions? 24-hr ops{' '}
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="font-semibold text-gold"
            >
              {BRAND_PHONE}
            </a>
            .
          </p>
        </header>

        <div className="space-y-7 px-5 py-6 text-ink sm:px-6">
          {localError ? (
            <p className="text-sm text-[#C0392B]">{localError}</p>
          ) : null}

          <section>
            <h2 className="text-lg font-semibold">Aircraft</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={creamLabel}>
                Aircraft type
                <input
                  className={creamInput}
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  placeholder="e.g. Pilatus PC-12"
                  required
                  autoComplete="off"
                />
              </label>
              <label className={creamLabel}>
                Tail number
                <input
                  className={`${creamInput} avionic`}
                  value={tail}
                  onChange={(e) => setTail(e.target.value.toUpperCase())}
                  placeholder="N123AB"
                  required
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Your times</h2>
            <p className="mt-1 text-sm text-[#6F675C]">
              Hours and minutes for each. Grey numbers are reference only —
              enter your own. We use these to sequence the trip and build the
              client&apos;s ETA sheet.
            </p>
            <div className="mt-2">
              <CreamTimeRow
                title="Time to position"
                hint={`How long until you can be at ${originIcao || 'origin'}, wheels on the ramp`}
                totalMinutes={ttp}
                placeholderTotalMinutes={REFERENCE_TTP_MIN}
                onChange={setTtp}
              />
              <CreamTimeRow
                title="Turn time"
                hint="Load pax/freight and fuel if needed, ready to depart"
                totalMinutes={quickTurn}
                placeholderTotalMinutes={DEFAULT_QUICK_TURN_MIN}
                onChange={setQuickTurn}
              />
              <CreamTimeRow
                title="Live leg"
                hint={`Today's flight time ${originIcao || 'origin'} → ${destIcao || 'destination'} in this aircraft`}
                totalMinutes={live}
                placeholderTotalMinutes={REFERENCE_LIVE_LEG_MIN}
                onChange={setLive}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Your price</h2>
            <label className={`${creamLabel} mt-3`}>
              Total price (USD)
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceText}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, '')
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setPriceText(v)
                  }}
                  placeholder="10,000"
                  className={`${creamInput} pl-7 avionic`}
                  required
                />
              </div>
            </label>
            <div className="mt-4">
              <div className="text-sm font-medium text-ink">
                What does it include?
              </div>
              <div
                className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#E4DDD0] bg-[#F7F2E3] p-1"
                role="group"
                aria-label="Fee inclusion"
              >
                <button
                  type="button"
                  className={[
                    'min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold',
                    feesIncluded
                      ? 'bg-white text-ink shadow-sm'
                      : 'bg-transparent text-[#6F675C]',
                  ].join(' ')}
                  onClick={() => setFeesIncluded(true)}
                >
                  ALL fees included
                </button>
                <button
                  type="button"
                  className={[
                    'min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold',
                    !feesIncluded
                      ? 'bg-white text-ink shadow-sm'
                      : 'bg-transparent text-[#6F675C]',
                  ].join(' ')}
                  onClick={() => setFeesIncluded(false)}
                >
                  Aircraft cost only
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-[#E8D9A8] bg-[#F5E6A8]/55 px-3 py-3 text-sm leading-relaxed text-ink">
              No taxes needed. OnFly adds FET and segment fees on flights after
              our fee is added for the end client — quote your number pre-tax.
            </div>
          </section>

          {showWait ? (
            <section className="rounded-2xl border border-[#E4DDD0] bg-[#F7F2E3]/80 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="avionic rounded-full border border-gold/50 px-2.5 py-0.5 text-[10px] tracking-wide text-gold">
                  ROUNDTRIP
                </span>
                <h2 className="text-lg font-semibold">Crew duty time</h2>
              </div>
              <p className="mt-1 text-sm text-[#6F675C]">
                This request returns same-day. Tell us what the crew has left
                and what your quote covers, so we don&apos;t build an ETA the
                crew can&apos;t legally fly.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-ink">
                    Duty time available today
                  </div>
                  <HrsMinsInput
                    label="Duty available"
                    totalMinutes={dutyAvail}
                    onChange={setDutyAvail}
                    labelClassName="sr-only"
                    inputClassName={creamHrs}
                    unitPlacement="below"
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink">
                    Duty included in this quote
                  </div>
                  <HrsMinsInput
                    label="Duty included"
                    totalMinutes={dutyIncl}
                    onChange={setDutyIncl}
                    labelClassName="sr-only"
                    inputClassName={creamHrs}
                    unitPlacement="below"
                  />
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <label className={creamLabel}>
              Anything else we should know?
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Crew swap at fuel stop, WX watch, door quirk, forklift on field…"
                className={`${creamInput} resize-y`}
              />
            </label>
          </section>

          <div className="space-y-3 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="min-h-14 w-full rounded-xl bg-[#141414] px-4 py-3.5 text-base font-semibold text-gold disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Submit quote to OnFly dispatch'}
            </button>
            <p className="text-center text-sm text-[#6F675C]">
              Goes straight to dispatch — we&apos;ll confirm by your preferred
              channel.
              {onDecline ? (
                <>
                  {' '}
                  Declining instead?{' '}
                  <button
                    type="button"
                    className="font-semibold text-ink underline"
                    disabled={busy}
                    onClick={onDecline}
                  >
                    Pass on this trip
                  </button>
                </>
              ) : null}
            </p>
            <p className="text-center text-[11px] text-[#9A9285]">
              OnFly Air dispatch · {BRAND_PHONE} · this link is unique to your
              operation
            </p>
          </div>
        </div>
      </form>
    )
  }

  // Desk / dark compact variant
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        submitForm()
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
                type="text"
                inputMode="decimal"
                value={maxWaitText}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setMaxWaitText(v)
                }}
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
          type="text"
          inputMode="decimal"
          value={priceText}
          onChange={(e) => {
            const v = e.target.value.replace(/,/g, '')
            if (v === '' || /^\d*\.?\d*$/.test(v)) setPriceText(v)
          }}
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

      <label className={offerLabel}>
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={offerInput}
          placeholder="Duty, WX, door quirk…"
        />
      </label>

      <button type="submit" disabled={busy} className={offerBtnPrimary}>
        {busy ? 'Sending…' : submitLabel}
      </button>
    </form>
  )
}
