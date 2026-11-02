/**
 * Amended / light booking — replaces the map stage.
 * Airports + cargo/pax + optional notes only; no full dims/timing gauntlet.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import {
  emptyTripRequestDraft,
  newLeg,
  type TripRequestDraft,
} from '@/domain/tripRequest'
import { writeFastQuoteDraft } from '@/components/PortalFastQuote'
import { connectPortalRequestToSpine } from '@/lib/portalRequestConnect'
import { submitTripRequest } from '@/lib/requestStore'

export function PortalAmendedBookPanel(props: {
  email?: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [cargoOnly, setCargoOnly] = useState(true)
  const [weightLbs, setWeightLbs] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      email: (props.email ?? '').trim().toLowerCase(),
      timing: 'asap',
      direction: 'one_way',
      service_mode: 'a2a',
      cargo_only: cargoOnly,
      cargo_dims_status: 'not_yet',
      cargo_weight_lbs: weightLbs ?? '',
      cargo_notes: notes.trim(),
      notes: notes.trim(),
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
      const row = submitTripRequest(draft, 'portal', { alert: 'desk' })
      writeFastQuoteDraft(draft)
      void connectPortalRequestToSpine(row).catch(() => {})
      navigate(`/portal/request?mode=book&from=fast-quote&id=${row.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-ink/88 text-cream backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cream/10 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
            Quick book
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Amended booking — essentials only
          </h2>
          <p className="mt-1 max-w-xl text-sm text-cream/60">
            Airports and what&apos;s moving. Desk fills dims, timing, and
            contacts after you send — or open the full form anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="inline-flex min-h-10 items-center rounded-full border border-cream/25 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream/80 hover:border-gold/50 hover:text-gold"
        >
          Back to map
        </button>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mx-auto w-full max-w-2xl space-y-5 px-5 py-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-cream/55">
            From
            <AirportSelect
              label=""
              value={origin}
              onChange={setOrigin}
              required
              inputClassName="mt-1 w-full rounded-xl border border-cream/20 bg-cream/10 px-3 py-3 text-sm text-cream outline-none placeholder:text-cream/35"
            />
          </label>
          <label className="block text-xs font-medium text-cream/55">
            To
            <AirportSelect
              label=""
              value={dest}
              onChange={setDest}
              required
              inputClassName="mt-1 w-full rounded-xl border border-cream/20 bg-cream/10 px-3 py-3 text-sm text-cream outline-none placeholder:text-cream/35"
            />
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-cream/55">What&apos;s moving?</div>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-cream/15 bg-cream/5 p-1">
            <button
              type="button"
              onClick={() => setCargoOnly(true)}
              className={[
                'rounded-lg px-3 py-2.5 text-sm font-medium',
                cargoOnly
                  ? 'bg-gold/25 font-semibold text-gold'
                  : 'text-cream/60 hover:text-cream',
              ].join(' ')}
            >
              Cargo
            </button>
            <button
              type="button"
              onClick={() => setCargoOnly(false)}
              className={[
                'rounded-lg px-3 py-2.5 text-sm font-medium',
                !cargoOnly
                  ? 'bg-gold/25 font-semibold text-gold'
                  : 'text-cream/60 hover:text-cream',
              ].join(' ')}
            >
              Passengers
            </button>
          </div>
        </div>

        {cargoOnly ? (
          <label className="block max-w-[12rem] text-xs font-medium text-cream/55">
            Approx. weight (lb)
            <NumericDraftInput
              integer
              blankZero
              min={0}
              className="avionic mt-1 w-full rounded-xl border border-cream/20 bg-cream/10 px-3 py-3 text-sm text-cream outline-none"
              value={weightLbs}
              onValueChange={setWeightLbs}
              placeholder="Optional"
            />
          </label>
        ) : null}

        <label className="block text-xs font-medium text-cream/55">
          Notes for desk{' '}
          <span className="font-normal text-cream/40">(optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Deadline, hazmat, forklift, special handling…"
            className="mt-1 w-full resize-y rounded-xl border border-cream/20 bg-cream/10 px-3 py-3 text-sm text-cream outline-none placeholder:text-cream/35"
          />
        </label>

        {error ? <p className="text-sm text-[#E8A0A0]">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-12 rounded-xl bg-gold px-4 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send to desk for hard quote'}
        </button>

        <p className="text-center text-xs text-cream/45">
          Need every field now?{' '}
          <Link
            to="/portal/request?mode=book"
            className="font-semibold text-gold hover:text-gold-lt"
          >
            Full booking form →
          </Link>
        </p>
      </form>
    </div>
  )
}
