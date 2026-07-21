import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  formatPieceDims,
  parseDims,
  type DimLengthUnit,
  type Piece,
} from '@/domain/dimsParser'
import { DimUnitToggle } from '@/components/DimUnitToggle'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import { createMapsAdapter } from '@/adapters/maps'
import { generateCandidates, type Candidate } from '@/domain/routing'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { getTaxRates } from '@/lib/taxRatesStore'
import { loadPricingPriors, priorRatePerNm } from '@/lib/pricingPriorsStore'
import { buildQuoteTotals } from '@/domain/quote'
import { NeedsInfoBadge } from '@/components/NeedsInfoBadge'
import { FlightChip } from '@/components/FlightChip'
import { TripRequestForm } from '@/components/TripRequestForm'
import { formatStopLocal } from '@/domain/timeFmt'
import { fleetStatusByTail } from '@/lib/fleetRadar'
import { getRequest, submitTripRequest } from '@/lib/requestStore'
import type { TripRequestDraft, TripRequestRecord } from '@/domain/tripRequest'

function resolveAirport(icaoRaw: string) {
  const icao = icaoRaw.trim().toUpperCase()
  return lookupAirport(icao) ?? AIRPORTS[icao] ?? AIRPORTS.KCAK!
}

export default function NewTripPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [request, setRequest] = useState<TripRequestRecord | null>(null)
  const [dimsText, setDimsText] = useState('')
  const [dimUnit, setDimUnit] = useState<DimLengthUnit>('in')
  const [piecesApproved, setPiecesApproved] = useState<Piece[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)

  // Hydrate from intake "Accept → Quote" (request id + session quote draft).
  useEffect(() => {
    const rid = params.get('request')
    if (rid) {
      const row = getRequest(rid)
      if (row) {
        setRequest(row)
        if (row.cargo_notes.trim()) setDimsText(row.cargo_notes)
        if (row.dim_unit) setDimUnit(row.dim_unit)
      }
    }
    try {
      const raw = sessionStorage.getItem('onfly_quote_draft')
      if (!raw) return
      const draft = JSON.parse(raw) as {
        candidates?: Candidate[]
        requestId?: string
      }
      if (draft.candidates?.length) setCandidates(draft.candidates)
      if (!rid && draft.requestId) {
        const row = getRequest(draft.requestId)
        if (row) setRequest(row)
      }
    } catch {
      /* ignore bad draft */
    }
  }, [params])

  const parsed = useMemo(
    () => parseDims(dimsText, { unit: dimUnit }),
    [dimsText, dimUnit],
  )

  const payloadKind =
    request && !request.cargo_only
      ? request.cargo_notes.trim()
        ? 'both'
        : 'pax'
      : 'cargo'
  const paxCount = request?.pax.length ?? 0

  async function onFormSubmit(draft: TripRequestDraft) {
    const row = submitTripRequest(draft, 'dispatch')
    setRequest(row)
    if (draft.cargo_notes.trim()) {
      setDimsText(draft.cargo_notes)
      setPiecesApproved(null)
    }
    if (draft.dim_unit) setDimUnit(draft.dim_unit)
    setCandidates(null)
    // Phase A: create Trip draft→routed with banded shortlist on the Board
    try {
      const { createRoutedTripFromRequest } = await import('@/lib/ladderFlow')
      const { trip } = await createRoutedTripFromRequest(row)
      nav(`/trips/${trip.id}`)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Request saved — could not auto-route; run estimate below',
      )
    }
  }

  async function runQuote(approvedPieces?: Piece[]) {
    if (!request) return
    const pieces =
      approvedPieces ??
      piecesApproved ??
      (payloadKind === 'pax' ? [] : parsed.pieces)
    if (payloadKind !== 'pax' && !pieces.length) {
      setError('Add cargo dims (e.g. 3 skids 48x40x60 @ 800ea), then approve')
      return
    }
    if (payloadKind !== 'pax' && !approvedPieces && !piecesApproved) {
      setError('Approve the parsed pieces first — then estimates run')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const leg = request.legs[0]!
      if (!leg.origin_icao?.trim() || !leg.dest_icao?.trim()) {
        throw new Error(
          'Origin and destination ICAO are required before quoting — edit the request and pick airports',
        )
      }
      const originAp = resolveAirport(leg.origin_icao)
      const destAp = resolveAirport(leg.dest_icao)
      if (originAp.icao === destAp.icao && leg.origin_icao !== leg.dest_icao) {
        throw new Error(
          `Could not resolve airports (“${leg.origin_icao}” / “${leg.dest_icao}”). Pick ICAOs from the catalog.`,
        )
      }
      const mode =
        request.service_mode === 'mixed'
          ? 'mixed'
          : request.service_mode === 'd2d'
            ? 'd2d'
            : 'a2a'
      const fleet = await loadFleetForRouting()
      const maps = createMapsAdapter()
      const radar = await fleetStatusByTail(fleet.map((a) => a.tail))
      const { getClient } = await import('@/lib/clientStore')
      const { fboFeesForAirport } = await import('@/lib/fboStore')
      const client = request.client_id ? getClient(request.client_id) : undefined
      const originFees = fboFeesForAirport(originAp.icao)
      const destFees = fboFeesForAirport(destAp.icao)
      const t0 = performance.now()
      const priors = await loadPricingPriors()
      const cands = await generateCandidates(
        {
          mode,
          payload_kind: payloadKind,
          pieces: pieces.length ? pieces : [],
          pax_count: paxCount,
          hazmat: request.hazmat,
          ready_at: request.ready_at,
          client_rules: client?.rules,
          origin: {
            kind: mode === 'a2a' ? 'airport' : 'address',
            text: leg.pickup_address || originAp.icao,
            icao: originAp.icao,
            lat: originAp.lat,
            lon: originAp.lon,
            tz: originAp.tz,
          },
          destination: {
            kind: mode === 'a2a' ? 'airport' : 'address',
            text: leg.dropoff_address || destAp.icao,
            icao: destAp.icao,
            lat: destAp.lat,
            lon: destAp.lon,
            tz: destAp.tz,
          },
          shipper:
            mode !== 'a2a'
              ? { lat: originAp.lat, lon: originAp.lon, tz: originAp.tz }
              : undefined,
          consignee:
            mode !== 'a2a'
              ? { lat: destAp.lat, lon: destAp.lon, tz: destAp.tz }
              : undefined,
        },
        fleet,
        maps,
        {
          fleetStatusByTail: radar,
          fboFees: {
            origin: originFees.fee,
            dest: destFees.fee,
            notes: [...originFees.reasoning, ...destFees.reasoning],
          },
          priorRatePerNm: (typeName, operatorId) =>
            priorRatePerNm(typeName, operatorId, priors),
        },
      )
      const ms = performance.now() - t0
      setCandidates(cands)
      if (!cands.length) {
        setError(
          'No aircraft cleared hard filters for this cargo/route — check door dims, payload, or fleet data',
        )
      } else {
        // Bring estimates into view (esp. mobile / short viewports).
        requestAnimationFrame(() => {
          document
            .getElementById('quote-candidates')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
      sessionStorage.setItem(
        'onfly_quote_draft',
        JSON.stringify({
          pieces,
          originText: leg.origin_icao,
          destText: leg.dest_icao,
          ready_at: request.ready_at,
          payloadKind,
          hazmat: request.hazmat,
          paxCount,
          mode,
          candidates: cands,
          originatedMs: ms,
          requestId: request.id,
          requestRef: request.ref,
          client_id: request.client_id,
        }),
      )
    } catch (e) {
      setCandidates(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function approvePiecesAndQuote() {
    if (!parsed.pieces.length) {
      setError('Nothing parsed yet — enter dims like “3 skids 48x40x60 @ 800ea”')
      return
    }
    setPiecesApproved(parsed.pieces)
    setError(null)
    void runQuote(parsed.pieces)
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Intake</div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">New trip request</h1>
          <p className="mt-1 text-sm text-muted">
            Same request form as the client portal — then generate an estimated quote from the
            fleet.
          </p>
        </div>
        <Link to="/" className="text-sm text-muted hover:text-cream">
          ← Board
        </Link>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          {!request ? (
            <TripRequestForm
              variant="dispatch"
              submitLabel="Save request & continue"
              onSubmit={onFormSubmit}
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-onplan/40 bg-onplan/10 p-3 text-sm">
                <div className="font-medium text-cream">
                  Request R-{request.ref} saved
                </div>
                <p className="mt-1 text-muted">
                  {request.lane} · {request.summary}
                  {request.client_name ? ` · ${request.client_name}` : ''}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs text-gold"
                  onClick={() => {
                    setRequest(null)
                    setCandidates(null)
                  }}
                >
                  Edit / new request
                </button>
              </div>

              {payloadKind !== 'pax' && (
                <>
                  <DimUnitToggle
                    value={dimUnit}
                    onChange={(u) => {
                      setDimUnit(u)
                      setPiecesApproved(null)
                      setCandidates(null)
                    }}
                  />
                  <label className="block text-xs uppercase tracking-wider text-muted">
                    Pieces (dims parser)
                    <textarea
                      value={dimsText}
                      onChange={(e) => {
                        setDimsText(e.target.value)
                        setPiecesApproved(null)
                        setCandidates(null)
                      }}
                      rows={2}
                      placeholder={
                        dimUnit === 'ft'
                          ? '3 skids 4x3.5x5 @ 800ea'
                          : '3 skids 48x40x60 @ 800ea'
                      }
                      className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
                    />
                  </label>
                  <p className="text-[11px] text-muted">
                    Entering{' '}
                    <span className="text-cream">
                      {dimUnit === 'ft' ? 'feet' : 'inches'}
                    </span>
                    . Preview shows both when feet are used (door fit = inches).
                  </p>
                  <div className="rounded-md border border-border/60 bg-ink/40 p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider text-muted">
                        Parsed preview
                      </span>
                      <span className="text-xs text-gold">{parsed.confidence}</span>
                    </div>
                    {parsed.pieces.length === 0 ? (
                      <p className="text-xs text-muted">
                        No pieces parsed yet — use e.g.{' '}
                        <span className="avionic text-cream">
                          {dimUnit === 'ft'
                            ? '3 skids 4x3.5x5 @ 800ea'
                            : '3 skids 48x40x60 @ 800ea'}
                        </span>
                      </p>
                    ) : (
                      parsed.pieces.map((p, i) => (
                        <div key={i} className="avionic text-cream">
                          {p.count}× {formatPieceDims(p, dimUnit)} @{' '}
                          {p.weight_lbs} lb
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {payloadKind !== 'pax' ? (
                <button
                  type="button"
                  disabled={busy || !parsed.pieces.length}
                  onClick={approvePiecesAndQuote}
                  className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
                >
                  {busy
                    ? 'Routing fleet…'
                    : piecesApproved
                      ? 'Re-run estimates'
                      : 'Approve pieces & get estimates'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runQuote([])}
                  className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
                >
                  {busy ? 'Routing…' : 'Generate estimated quote'}
                </button>
              )}
              {error && <p className="text-sm text-late">{error}</p>}
              {piecesApproved && busy && (
                <p className="text-xs text-muted">
                  Pieces approved — scoring operators…
                </p>
              )}
            </div>
          )}
        </section>

        <section id="quote-candidates" className="space-y-3">
          {candidates === null && (
            <div className="rounded-lg border border-border border-dashed bg-surface p-8 text-center text-sm text-muted">
              {request
                ? payloadKind === 'pax'
                  ? 'Generate an estimate — Cheapest / Fastest / Best from the fleet.'
                  : 'Approve pieces to score the fleet and show operator options here.'
                : 'Complete the trip request form to continue to estimates.'}
            </div>
          )}
          {candidates && candidates.length === 0 && (
            <div className="rounded-lg border border-late/40 bg-late/10 p-6 text-sm text-late">
              No operator options returned. Fix cargo dims / airports and try
              again.
            </div>
          )}
          {candidates?.map((c) => {
            const tax = buildQuoteTotals(
              { ...c, price: c.price },
              {
                markupMode: 'dollars',
                markupValue: c.price - c.cost,
                payloadKind,
                mtowLbs: c.mtow_lbs,
                paxCount,
                segments: 1,
                rates: getTaxRates(),
              },
            )
            const end = c.chain[c.chain.length - 1]
            const destTz = end?.to.tz ?? 'UTC'
            const eta = end ? formatStopLocal(end.est_end, destTz) : null
            return (
              <article
                key={c.aircraft_id}
                className={[
                  'rounded-lg border bg-surface p-4',
                  c.label === 'best' ? 'border-gold' : 'border-border',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gold">
                      {c.label ?? 'option'}
                    </div>
                    <div className="font-medium text-cream">{c.operator_name}</div>
                    <div className="avionic text-sm text-muted">
                      {c.tail} · {c.type_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="avionic text-lg text-cream">
                      ${tax.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-muted">
                      conf {(c.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                {eta && (
                  <div className="mt-2 text-xs text-muted">
                    ETA {eta.local} <span className="avionic">({eta.zulu})</span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <FlightChip
                    phase={c.phase}
                    inPosition={c.inPosition}
                    laddBlocked={c.laddBlocked}
                  />
                  <NeedsInfoBadge count={c.needsInfo.length} />
                </div>
                <button
                  type="button"
                  className="mt-3 text-sm text-gold hover:text-gold-lt"
                  onClick={() => {
                    // Persist selection preference for composer
                    try {
                      const raw = sessionStorage.getItem('onfly_quote_draft')
                      if (raw) {
                        const d = JSON.parse(raw) as { preferredAircraftId?: string }
                        d.preferredAircraftId = c.aircraft_id
                        sessionStorage.setItem('onfly_quote_draft', JSON.stringify(d))
                      }
                    } catch {
                      /* ignore */
                    }
                    nav('/quotes/preview')
                  }}
                >
                  Compose &amp; send quote + ETA →
                </button>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
