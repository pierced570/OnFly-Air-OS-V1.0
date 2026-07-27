/**
 * Recommendation matrix — the scoring system for trip operator shortlists.
 * Edit knobs here; Dispatch / Parse / Send-to-new-operator all reuse them
 * via recommendForDeskDraft → generateCandidates.
 */

import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { FlightChip } from '@/components/FlightChip'
import {
  RECOMMEND_MATRIX_LABELS,
  type RecommendMatrixConfig,
} from '@/domain/recommendMatrix'
import type { Candidate } from '@/domain/routing'
import {
  getRecommendMatrix,
  resetRecommendMatrix,
  setRecommendMatrixField,
  subscribeRecommendMatrix,
} from '@/lib/recommendMatrixStore'
import {
  newDeskLeg,
  recommendForDeskDraft,
  syncDeskDraftDerived,
  type DeskDraft,
} from '@/lib/scratchDeskFlow'

function emptyDraft(): DeskDraft {
  return syncDeskDraftDerived({
    client_name: '',
    client_id: null,
    po: '',
    timing: 'asap',
    roundtrip: false,
    cargo_only: true,
    legs: [newDeskLeg()],
    pieces_text: '',
    hazmat: false,
    notes: '',
    raw_notes: '',
    payload_kind: 'cargo',
    pax_count: 0,
    origin_text: '',
    destination_text: '',
    asap: true,
    ready_label: 'ASAP',
  })
}

function labelBadge(c: Candidate): string | null {
  if (c.label === 'best') return 'Best'
  if (c.label === 'cheapest') return 'Cheapest'
  if (c.label === 'fastest') return 'Fastest'
  return null
}

const FIELD_ORDER: (keyof RecommendMatrixConfig)[] = [
  'weight_price',
  'weight_time',
  'weight_radar',
  'target_margin_pct',
  'recommend_limit',
  'truck_per_mile',
  'truck_min',
  'payload_factor',
  'reserve_nm',
  'door_diagonal_factor',
  'unresolved_base_nm',
]

function MatrixSettingsPanel() {
  const matrix = useSyncExternalStore(
    subscribeRecommendMatrix,
    getRecommendMatrix,
    getRecommendMatrix,
  )
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-gold">
            Scoring settings
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Changes apply to Dispatch recommend, Parse & shortlist, and this
            matrix — no code deploy needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-xs text-gold hover:text-gold-lt"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide settings' : 'Edit settings'}
          </button>
          {open ? (
            <button
              type="button"
              className="text-xs text-muted hover:text-cream"
              onClick={() => resetRecommendMatrix()}
            >
              Reset defaults
            </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_ORDER.map((key) => (
            <label key={key} className="block text-xs text-muted">
              {RECOMMEND_MATRIX_LABELS[key]}
              <input
                type="number"
                step={
                  key.startsWith('weight_') ||
                  key === 'payload_factor' ||
                  key === 'door_diagonal_factor'
                    ? 0.01
                    : key === 'recommend_limit'
                      ? 1
                      : 0.5
                }
                min={0}
                className="mt-1 w-full rounded-md border border-border bg-ink px-2 py-1.5 font-mono text-sm text-cream"
                value={matrix[key]}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!Number.isFinite(n)) return
                  setRecommendMatrixField(key, n)
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-2 font-mono text-[11px] text-muted">
          Best weights {matrix.weight_price.toFixed(2)}/
          {matrix.weight_time.toFixed(2)}/{matrix.weight_radar.toFixed(2)} ·
          margin {matrix.target_margin_pct}% · shortlist{' '}
          {matrix.recommend_limit}
        </p>
      )}
    </div>
  )
}

export function RecommendationMatrixPanel() {
  const matrix = useSyncExternalStore(
    subscribeRecommendMatrix,
    getRecommendMatrix,
    getRecommendMatrix,
  )
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [pieces, setPieces] = useState('')
  const [pax, setPax] = useState(0)
  const [hazmat, setHazmat] = useState(false)
  const [asap, setAsap] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lane, setLane] = useState('')
  const [rows, setRows] = useState<Candidate[]>([])

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const cargo_only = pax <= 0
      const draft = syncDeskDraftDerived({
        ...emptyDraft(),
        timing: asap ? 'asap' : 'scheduled',
        asap,
        ready_label: asap ? 'ASAP' : 'scheduled',
        cargo_only,
        hazmat,
        pieces_text: pieces,
        pax_count: Math.max(0, pax),
        payload_kind: cargo_only ? 'cargo' : pieces.trim() ? 'both' : 'pax',
        legs: [
          newDeskLeg({
            origin_icao: origin.trim().toUpperCase(),
            dest_icao: dest.trim().toUpperCase(),
            pax: Math.max(0, pax),
          }),
        ],
        origin_text: origin.trim().toUpperCase(),
        destination_text: dest.trim().toUpperCase(),
      })
      const result = await recommendForDeskDraft(draft)
      setLane(result.lane)
      setRows(result.candidates)
      if (result.error) setError(result.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-cream">
          Recommendation matrix
        </h2>
        <p className="mt-1 text-sm text-muted">
          Internal scoring for trip operator shortlists — door fit, payload,
          distance, cost, and radar. Dispatch “Send to new operator” and Parse
          & shortlist use these same settings.
        </p>
      </header>

      <MatrixSettingsPanel />

      <div className="grid gap-3 sm:grid-cols-2">
        <AirportSelect
          label="Origin"
          value={origin}
          onChange={setOrigin}
          placeholder="Search origin…"
        />
        <AirportSelect
          label="Destination"
          value={dest}
          onChange={setDest}
          placeholder="Search destination…"
        />
        <label className="block text-xs text-muted sm:col-span-2">
          Cargo (dims @ weight, or “tools”)
          <input
            value={pieces}
            onChange={(e) => setPieces(e.target.value)}
            placeholder="2 skids 48x40x60 @ 800ea · or tools"
            className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
          />
        </label>
        <label className="block text-xs text-muted">
          Pax / techs
          <input
            type="number"
            min={0}
            value={pax}
            onChange={(e) => setPax(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 font-mono text-sm text-cream"
          />
        </label>
        <div className="flex flex-wrap items-end gap-4 pb-1">
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={asap}
              onChange={(e) => setAsap(e.target.checked)}
            />
            ASAP
          </label>
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={hazmat}
              onChange={(e) => setHazmat(e.target.checked)}
            />
            Hazmat
          </label>
        </div>
      </div>

      <button
        type="button"
        disabled={busy || !origin.trim() || !dest.trim()}
        onClick={() => void run()}
        className="rounded-md bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
      >
        {busy ? 'Scoring…' : 'Run matrix'}
      </button>

      {error && <p className="text-sm text-late">{error}</p>}

      {lane && !error && (
        <p className="font-mono text-xs text-gold">
          {lane}
          {rows.length
            ? ` · ${rows.length}/${matrix.recommend_limit} candidates`
            : ''}
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Operator</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">ETA</th>
                <th className="px-3 py-2 font-medium">Radar</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const badge = labelBadge(c)
                return (
                  <tr
                    key={`${c.operator_id}-${c.aircraft_id}`}
                    className="border-t border-border/60 bg-ink/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-cream">
                        {c.operator_name}
                        {badge ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                            {badge}
                          </span>
                        ) : null}
                      </div>
                      {c.bookingGated && (
                        <div className="text-[11px] text-late">
                          Booking gated
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.type_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-cream">
                      ${Math.round(c.cost)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gold">
                      ${Math.round(c.price)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">
                      {c.eta_end
                        ? `${c.eta_end.slice(11, 16)}Z`
                        : '—'}
                      {c.circuit_nm
                        ? ` · ${Math.round(c.circuit_nm)} nm`
                        : ''}
                    </td>
                    <td className="px-3 py-2.5">
                      <FlightChip
                        phase={c.phase}
                        inPosition={c.inPosition}
                        laddBlocked={c.laddBlocked}
                      />
                    </td>
                    <td className="max-w-[14rem] px-3 py-2.5 text-xs text-muted">
                      {[
                        ...(c.needsInfo ?? []).slice(0, 2),
                        ...(c.reasoning ?? []).slice(0, 2),
                      ].join(' · ') || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        To send trip offers, use{' '}
        <Link to="/dispatch" className="text-gold hover:text-gold-lt">
          Dispatch center
        </Link>
        . Shortlists there are scored with this matrix.
      </p>
    </div>
  )
}
