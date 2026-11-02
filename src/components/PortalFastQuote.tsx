/**
 * Single-page rough estimate — origin, dest, cargo/pax, optional weight + email.
 * Then soft bands + CTA to call or open the traditional booking form.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import {
  BRAND_PHONE,
  BRAND_PHONE_E164,
  dialBrandOps,
} from '@/domain/brand'
import {
  emptyTripRequestDraft,
  newLeg,
  type TripRequestDraft,
} from '@/domain/tripRequest'
import {
  destinationFromGoMinutes,
  formatHoursMinutes,
} from '@/domain/softPricing'
import { SoftEstimateTimeline } from '@/components/SoftEstimateTimeline'
import {
  buildSoftPricingForRequest,
  type SoftPricingPackageResult,
} from '@/lib/softPricingPackage'
import {
  connectPortalRequestToSpine,
  saveRequestSoftPackage,
} from '@/lib/portalRequestConnect'
import { submitTripRequest } from '@/lib/requestStore'

export const FAST_QUOTE_DRAFT_KEY = 'onfly.portal.fastQuote.draft.v1'

export function writeFastQuoteDraft(draft: TripRequestDraft): void {
  try {
    sessionStorage.setItem(FAST_QUOTE_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function readFastQuoteDraft(): TripRequestDraft | null {
  try {
    const raw = sessionStorage.getItem(FAST_QUOTE_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TripRequestDraft
  } catch {
    return null
  }
}

export function clearFastQuoteDraft(): void {
  try {
    sessionStorage.removeItem(FAST_QUOTE_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export function PortalFastQuote(props: {
  /** Prefill email when signed in. */
  email?: string | null
}) {
  const navigate = useNavigate()
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [cargoOnly, setCargoOnly] = useState(true)
  const [weightLbs, setWeightLbs] = useState<number | null>(null)
  const [email, setEmail] = useState(() => (props.email ?? '').trim())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pkg, setPkg] = useState<SoftPricingPackageResult | null>(null)
  const [draftSaved, setDraftSaved] = useState<TripRequestDraft | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const o = origin.trim().toUpperCase()
    const d = dest.trim().toUpperCase()
    if (o.length < 3 || d.length < 3) {
      setError('Pick origin and destination airports.')
      return
    }
    if (o === d) {
      setError('Origin and destination need to be different.')
      return
    }

    const draft: TripRequestDraft = {
      ...emptyTripRequestDraft(),
      email: email.trim().toLowerCase(),
      timing: 'asap',
      direction: 'one_way',
      service_mode: 'a2a',
      cargo_only: cargoOnly,
      cargo_dims_status: 'not_yet',
      cargo_weight_lbs: weightLbs ?? '',
      cargo_notes: '',
      legs: [
        newLeg({
          origin_icao: o,
          dest_icao: d,
          payload: cargoOnly ? 'cargo' : 'pax',
          cargo_dims_status: 'not_yet',
          cargo_weight_lbs: weightLbs ?? '',
          pax: cargoOnly ? [] : [{ name: '', weight_lbs: '', dob: '' }],
        }),
      ],
      pax: cargoOnly ? [] : [{ name: '', weight_lbs: '', dob: '' }],
      pax_details_deferred: !cargoOnly,
    }

    setBusy(true)
    try {
      const row = submitTripRequest(draft, 'portal', { alert: 'cost_inquiry' })
      writeFastQuoteDraft(draft)
      setDraftSaved(draft)
      void connectPortalRequestToSpine(row).catch(() => {})
      const soft = await buildSoftPricingForRequest(row)
      setPkg(soft)
      if (!soft.error) saveRequestSoftPackage(row.id, soft)
      if (soft.error) setError(soft.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function goBook() {
    if (draftSaved) writeFastQuoteDraft(draftSaved)
    navigate('/portal/request?mode=book&from=fast-quote')
  }

  if (pkg && !pkg.error && pkg.classes.length > 0) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Rough estimate
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            <span className="avionic">
              {pkg.origin_display} → {pkg.dest_display}
            </span>
            <span className="avionic ml-2 text-lg text-muted">
              · {pkg.live_nm} NM
            </span>
          </h2>
          <p className="mt-2 text-sm text-muted">
            Ballpark only — not a bookable quote. Call us or send a full booking
            request for a real number (typically 10–15 minutes).
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pkg.classes.slice(0, 6).map((c) => {
            const inquiry = c.pricing_mode === 'inquiry_only'
            const eta = formatHoursMinutes(destinationFromGoMinutes(c.timing))
            return (
              <li
                key={c.class_id}
                className="portal-glass-strong flex flex-col justify-between rounded-2xl p-4"
              >
                <div>
                  <div className="text-sm font-semibold text-ink">{c.label}</div>
                  <p className="mt-1 text-[11px] text-muted">
                    {eta ? `~${eta} to dest` : 'Timing TBD'}
                  </p>
                </div>
                <div className="avionic mt-3 text-xl font-semibold text-gold">
                  {inquiry
                    ? 'Call'
                    : `$${c.price_low.toLocaleString('en-US')}–$${c.price_high.toLocaleString('en-US')}`}
                </div>
              </li>
            )
          })}
        </ul>

        <SoftEstimateTimeline classes={pkg.classes} compact />

        <p className="text-xs leading-relaxed text-muted">{pkg.disclaimer}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => dialBrandOps()}
            className="portal-glass-ink flex min-h-[4.5rem] flex-col justify-center rounded-2xl px-5 py-4 text-left text-cream transition hover:border-gold/40"
          >
            <span className="text-base font-semibold">Call us now</span>
            <span className="mt-0.5 text-xs text-cream/55">
              24-hr ops ·{' '}
              <span className="avionic font-semibold text-gold">
                {BRAND_PHONE}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={goBook}
            className="flex min-h-[4.5rem] flex-col justify-center rounded-2xl bg-gold px-5 py-4 text-left text-ink shadow-[0_12px_40px_rgba(201,162,39,0.35)] transition hover:bg-gold-lt"
          >
            <span className="text-base font-semibold">
              Send a full booking request
            </span>
            <span className="mt-0.5 text-xs text-ink/70">
              Traditional form — dims, timing, contacts. Prefills this route.
            </span>
          </button>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            className="font-semibold text-gold"
            onClick={() => {
              setPkg(null)
              setError(null)
            }}
          >
            ← Edit this estimate
          </button>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="text-muted hover:text-gold"
          >
            Or dial {BRAND_PHONE}
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
          Rough estimate
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          One page. Ballpark in seconds.
        </h1>
        <p className="mt-2 text-sm text-muted">
          Airports in, soft pricing out. Then call us or send a full booking
          request for a hard quote.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-muted">
          From
          <AirportSelect
            label=""
            value={origin}
            onChange={setOrigin}
            required
            inputClassName="portal-glass-input mt-1 rounded-xl px-3 py-3 text-sm text-ink outline-none"
          />
        </label>
        <label className="block text-xs font-medium text-muted">
          To
          <AirportSelect
            label=""
            value={dest}
            onChange={setDest}
            required
            inputClassName="portal-glass-input mt-1 rounded-xl px-3 py-3 text-sm text-ink outline-none"
          />
        </label>
      </div>

      <div>
        <div className="text-xs font-medium text-muted">What&apos;s moving?</div>
        <div className="portal-glass mt-2 grid grid-cols-2 gap-1 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setCargoOnly(true)}
            className={[
              'rounded-xl px-3 py-2.5 text-sm font-medium',
              cargoOnly
                ? 'bg-gold/20 font-semibold text-ink'
                : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            Cargo
          </button>
          <button
            type="button"
            onClick={() => setCargoOnly(false)}
            className={[
              'rounded-xl px-3 py-2.5 text-sm font-medium',
              !cargoOnly
                ? 'bg-gold/20 font-semibold text-ink'
                : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            Passengers
          </button>
        </div>
      </div>

      {cargoOnly ? (
        <label className="block max-w-[12rem] text-xs font-medium text-muted">
          Approx. total weight (lb)
          <NumericDraftInput
            integer
            blankZero
            min={0}
            className="portal-glass-input avionic mt-1 w-full rounded-xl px-3 py-3 text-sm text-ink outline-none"
            value={weightLbs}
            onValueChange={setWeightLbs}
            placeholder="Optional"
          />
        </label>
      ) : null}

      <label className="block text-xs font-medium text-muted">
        Work email{' '}
        <span className="font-normal text-muted/80">(optional)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@company.com"
          className="portal-glass-input mt-1 w-full rounded-xl px-3 py-3 text-sm text-ink outline-none"
        />
      </label>

      {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full min-h-14 rounded-xl bg-gold px-4 text-sm font-semibold text-ink shadow-[0_12px_40px_rgba(201,162,39,0.35)] hover:bg-gold-lt disabled:opacity-50"
      >
        {busy ? 'Estimating…' : 'Get rough estimate'}
      </button>

      <p className="text-center text-xs text-muted">
        Need the full request now?{' '}
        <Link
          to="/portal/request?mode=book"
          className="font-semibold text-gold"
        >
          Traditional booking form →
        </Link>
      </p>
    </form>
  )
}
