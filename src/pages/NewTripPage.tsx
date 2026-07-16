import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { parseDims, type Piece } from '@/domain/dimsParser'
import { localInputToUtc } from '@/domain/timeFmt'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import { createMapsAdapter } from '@/adapters/maps'
import { generateCandidates, type Candidate } from '@/domain/routing'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'
import { buildQuoteTotals } from '@/domain/quote'
import { NeedsInfoBadge } from '@/components/NeedsInfoBadge'
import { RestChip } from '@/components/RestChip'
import { formatStopLocal } from '@/domain/timeFmt'
import { fleetStatusByTail } from '@/lib/fleetRadar'

type PayloadKind = 'cargo' | 'pax' | 'both'

function detectPlace(text: string): {
  kind: 'airport' | 'address'
  icao?: string
  lat: number
  lon: number
  tz: string
  label: string
} {
  const t = text.trim().toUpperCase()
  if (/^[KCP][A-Z0-9]{3}$/.test(t) || lookupAirport(t)) {
    const ap = lookupAirport(t) ?? AIRPORTS[t]
    if (ap) {
      return {
        kind: 'airport',
        icao: ap.icao,
        lat: ap.lat,
        lon: ap.lon,
        tz: ap.tz,
        label: ap.name,
      }
    }
  }
  // Heuristic city stubs for demos
  const cities: Record<string, { lat: number; lon: number; tz: string; icao: string }> = {
    AKRON: { lat: 41.08, lon: -81.52, tz: 'America/New_York', icao: 'KCAK' },
    CHICAGO: { lat: 41.88, lon: -87.63, tz: 'America/Chicago', icao: 'KMDW' },
  }
  for (const [key, v] of Object.entries(cities)) {
    if (text.toUpperCase().includes(key)) {
      return {
        kind: 'address',
        icao: v.icao,
        lat: v.lat,
        lon: v.lon,
        tz: v.tz,
        label: text,
      }
    }
  }
  // fallback KCAK
  const ap = AIRPORTS.KCAK!
  return { kind: 'address', icao: 'KCAK', lat: ap.lat, lon: ap.lon, tz: ap.tz, label: text }
}

export default function NewTripPage() {
  const nav = useNavigate()
  const [payloadKind, setPayloadKind] = useState<PayloadKind>('cargo')
  const [dimsText, setDimsText] = useState('3 skids 48x40x60 @ 800ea')
  const [originText, setOriginText] = useState('Akron, OH')
  const [destText, setDestText] = useState('Chicago, IL')
  const [readyLocal, setReadyLocal] = useState('2026-07-15T09:00')
  const [hazmat, setHazmat] = useState(false)
  const [paxCount, setPaxCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [piecesApproved, setPiecesApproved] = useState<Piece[] | null>(null)

  const parsed = useMemo(() => parseDims(dimsText), [dimsText])

  async function runQuote() {
    setBusy(true)
    setError(null)
    try {
      const pieces = piecesApproved ?? parsed.pieces
      if (!pieces.length) throw new Error('Approve parsed pieces first')
      const origin = detectPlace(originText)
      const dest = detectPlace(destText)
      const originAp = lookupAirport(origin.icao!) ?? AIRPORTS[origin.icao!]!
      const destAp = lookupAirport(dest.icao!) ?? AIRPORTS[dest.icao!]!
      const mode =
        origin.kind === 'airport' && dest.kind === 'airport' ? 'a2a' : 'd2d'
      const ready_at = localInputToUtc(readyLocal, origin.tz)
      const fleet = await loadFleetForRouting()
      const maps = createMapsAdapter()
      const radar = await fleetStatusByTail(fleet.map((a) => a.tail))
      const t0 = performance.now()
      const cands = await generateCandidates(
        {
          mode,
          payload_kind: payloadKind,
          pieces,
          pax_count: paxCount,
          hazmat,
          ready_at,
          origin: {
            kind: origin.kind,
            text: originText,
            icao: originAp.icao,
            lat: originAp.lat,
            lon: originAp.lon,
            tz: originAp.tz,
          },
          destination: {
            kind: dest.kind,
            text: destText,
            icao: destAp.icao,
            lat: destAp.lat,
            lon: destAp.lon,
            tz: destAp.tz,
          },
          shipper:
            mode === 'd2d'
              ? { lat: origin.lat, lon: origin.lon, tz: origin.tz }
              : undefined,
          consignee:
            mode === 'd2d' ? { lat: dest.lat, lon: dest.lon, tz: dest.tz } : undefined,
        },
        fleet,
        maps,
        { fleetStatusByTail: radar },
      )
      const ms = performance.now() - t0
      console.info(`generateCandidates ${Math.round(ms)}ms → ${cands.length} options`)
      setCandidates(cands)
      // stash for quote page
      sessionStorage.setItem(
        'onfly_quote_draft',
        JSON.stringify({
          pieces,
          originText,
          destText,
          ready_at,
          payloadKind,
          hazmat,
          paxCount,
          mode,
          candidates: cands,
          originatedMs: ms,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Intake</div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">New trip request</h1>
          <p className="mt-1 text-sm text-muted">
            Instant estimated quote from OnFly fleet data — approve parsed fields, don&apos;t retype.
          </p>
        </div>
        <Link to="/" className="text-sm text-muted hover:text-cream">
          ← Board
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-2">
            {(['cargo', 'pax', 'both'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPayloadKind(k)}
                className={[
                  'rounded-md px-3 py-1.5 text-sm capitalize',
                  payloadKind === k ? 'bg-gold text-ink' : 'bg-surface-2 text-muted',
                ].join(' ')}
              >
                {k}
              </button>
            ))}
          </div>

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
              <span className="text-xs uppercase tracking-wider text-muted">Parsed preview</span>
              <span className="text-xs text-gold">{parsed.confidence}</span>
            </div>
            {parsed.pieces.map((p, i) => (
              <div key={i} className="avionic text-cream">
                {p.count}× {p.l_in}×{p.w_in}×{p.h_in} in @ {p.weight_lbs} lb
              </div>
            ))}
            {parsed.notes.map((n) => (
              <div key={n} className="text-xs text-late">
                {n}
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs uppercase tracking-wider text-muted">
              Origin
              <input
                value={originText}
                onChange={(e) => setOriginText(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
              />
            </label>
            <label className="block text-xs uppercase tracking-wider text-muted">
              Destination
              <input
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
              />
            </label>
            <label className="block text-xs uppercase tracking-wider text-muted">
              Ready (local at origin)
              <input
                type="datetime-local"
                value={readyLocal}
                onChange={(e) => setReadyLocal(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
              />
            </label>
            {payloadKind !== 'cargo' && (
              <label className="block text-xs uppercase tracking-wider text-muted">
                Pax count
                <input
                  type="number"
                  value={paxCount}
                  onChange={(e) => setPaxCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
                />
              </label>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-cream">
            <input type="checkbox" checked={hazmat} onChange={(e) => setHazmat(e.target.checked)} />
            Hazmat
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={() => void runQuote()}
            className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
          >
            {busy ? 'Routing…' : 'Generate estimated quote'}
          </button>
          {error && <p className="text-sm text-late">{error}</p>}
        </section>

        <section className="space-y-3">
          {!candidates && (
            <div className="rounded-lg border border-border border-dashed bg-surface p-8 text-center text-sm text-muted">
              Options appear here after you generate — Cheapest / Fastest / Best from the live fleet.
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
                  <RestChip
                    rest={c.rest}
                    inPosition={c.inPosition}
                    laddBlocked={c.laddBlocked}
                  />
                  <NeedsInfoBadge count={c.needsInfo.length} />
                  {c.bookingGated && (
                    <span className="rounded-full border border-late/40 px-2 py-0.5 text-xs text-late">
                      booking gated
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {c.reasoning.slice(0, 3).map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                  {c.needsInfo.map((n) => (
                    <li key={n} className="text-gold">
                      · NEEDS-INFO: {n}
                    </li>
                  ))}
                </ul>
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
