import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { parseDims, type Piece } from '@/domain/dimsParser'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import { createMapsAdapter } from '@/adapters/maps'
import { generateCandidates, type Candidate } from '@/domain/routing'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'
import { buildQuoteTotals } from '@/domain/quote'
import { NeedsInfoBadge } from '@/components/NeedsInfoBadge'
import { FlightChip } from '@/components/FlightChip'
import { TripRequestForm } from '@/components/TripRequestForm'
import { formatStopLocal } from '@/domain/timeFmt'
import { fleetStatusByTail } from '@/lib/fleetRadar'
import { submitTripRequest } from '@/lib/requestStore'
import type { TripRequestDraft, TripRequestRecord } from '@/domain/tripRequest'

function resolveAirport(icaoRaw: string) {
  const icao = icaoRaw.trim().toUpperCase()
  return lookupAirport(icao) ?? AIRPORTS[icao] ?? AIRPORTS.KCAK!
}

export default function NewTripPage() {
  const nav = useNavigate()
  const [request, setRequest] = useState<TripRequestRecord | null>(null)
  const [dimsText, setDimsText] = useState('')
  const [piecesApproved, setPiecesApproved] = useState<Piece[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)

  const parsed = useMemo(() => parseDims(dimsText), [dimsText])

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
    setCandidates(null)
  }

  async function runQuote() {
    if (!request) return
    setBusy(true)
    setError(null)
    try {
      const pieces = piecesApproved ?? parsed.pieces
      if (payloadKind !== 'pax' && !pieces.length) {
        throw new Error('Approve parsed pieces first (or describe cargo above)')
      }
      const leg = request.legs[0]!
      const originAp = resolveAirport(leg.origin_icao)
      const destAp = resolveAirport(leg.dest_icao)
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
        },
      )
      const ms = performance.now() - t0
      setCandidates(cands)
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
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
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
                  <label className="block text-xs uppercase tracking-wider text-muted">
                    Pieces (dims parser)
                    <textarea
                      value={dimsText}
                      onChange={(e) => {
                        setDimsText(e.target.value)
                        setPiecesApproved(null)
                      }}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
                    />
                  </label>
                  <div className="rounded-md border border-border/60 bg-ink/40 p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider text-muted">
                        Parsed preview
                      </span>
                      <span className="text-xs text-gold">{parsed.confidence}</span>
                    </div>
                    {parsed.pieces.map((p, i) => (
                      <div key={i} className="avionic text-cream">
                        {p.count}× {p.l_in}×{p.w_in}×{p.h_in} in @ {p.weight_lbs} lb
                      </div>
                    ))}
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-gold/40 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                      onClick={() => setPiecesApproved(parsed.pieces)}
                    >
                      {piecesApproved ? 'Pieces approved ✓' : 'Approve pieces'}
                    </button>
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void runQuote()}
                className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
              >
                {busy ? 'Routing…' : 'Generate estimated quote'}
              </button>
              {error && <p className="text-sm text-late">{error}</p>}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {!candidates && (
            <div className="rounded-lg border border-border border-dashed bg-surface p-8 text-center text-sm text-muted">
              {request
                ? 'Approve pieces (if cargo), then generate — Cheapest / Fastest / Best from the fleet.'
                : 'Complete the trip request form to continue to estimates.'}
            </div>
          )}
          {candidates?.map((c) => {
            const tax = buildQuoteTotals(
              { ...c, price: c.price },
              {
                markupMode: 'dollars',
                markupValue: c.price - c.cost,
                payloadKind,
                mtowLbs: c.type_name?.match(/310/) ? 5500 : 12500,
                paxCount,
                segments: 1,
                rates: TEST_TAX_RATES_2026,
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
                  onClick={() => nav('/quotes/preview')}
                >
                  Open quote composer →
                </button>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
