/**
 * Recommended calls by ICAO — ordered operator lists per location.
 * Replaces the old recommendation-matrix playground in Network → Recommend.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AirportSelect } from '@/components/AirportSelect'
import { OperatorSelect } from '@/components/OperatorSelect'
import { formatAirportShort, lookupAirport } from '@/domain/airports'
import {
  ensureDeskOperatorsLoaded,
  listDeskOperators,
} from '@/lib/deskOperatorSearch'
import {
  addLocationRecommendOperator,
  listLocationRecommends,
  moveLocationRecommendOperator,
  removeLocationRecommend,
  removeLocationRecommendOperator,
  subscribeLocationRecommend,
  upsertLocationRecommend,
} from '@/lib/locationRecommendStore'

function locationLabel(icao: string): string {
  const a = lookupAirport(icao)
  return a ? formatAirportShort(a) : icao
}

export function LocationRecommendPanel() {
  const rows = useSyncExternalStore(
    subscribeLocationRecommend,
    listLocationRecommends,
    listLocationRecommends,
  )
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null)
  const [addIcao, setAddIcao] = useState('')
  const [addOpName, setAddOpName] = useState('')
  const [addOpId, setAddOpId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void ensureDeskOperatorsLoaded()
  }, [])

  // Keep selection valid after delete / hydrate; auto-select first location.
  useEffect(() => {
    if (selectedIcao) {
      if (!rows.some((r) => r.icao === selectedIcao)) {
        setSelectedIcao(rows[0]?.icao ?? null)
      }
      return
    }
    if (rows[0]) setSelectedIcao(rows[0].icao)
  }, [rows, selectedIcao])

  const selected = useMemo(
    () => rows.find((r) => r.icao === selectedIcao) ?? null,
    [rows, selectedIcao],
  )

  function addLocation() {
    setError(null)
    try {
      const row = upsertLocationRecommend(addIcao)
      setSelectedIcao(row.icao)
      setAddIcao('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function addOperator() {
    if (!selected) return
    setError(null)
    const name = addOpName.trim()
    if (!name) {
      setError('Select an operator')
      return
    }
    let id = addOpId
    if (!id) {
      const hit = listDeskOperators().find(
        (o) => o.name.trim().toLowerCase() === name.toLowerCase(),
      )
      id = hit?.id ?? null
    }
    if (!id) {
      setError('Pick an operator from the network list')
      return
    }
    try {
      addLocationRecommendOperator(selected.icao, {
        operator_id: id,
        name,
      })
      setAddOpName('')
      setAddOpId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-cream md:text-2xl">
          Recommended calls
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Add an ICAO, then the ordered list of operators to call for that
          location. Click a location to view or edit its call order.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Add location
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <AirportSelect
            label="ICAO"
            value={addIcao}
            onChange={setAddIcao}
            allowUnknown
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={addLocation}
            className="shrink-0 rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt"
          >
            Add ICAO
          </button>
        </div>
        {error && !selected ? (
          <p className="mt-2 text-xs text-late">{error}</p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_1fr]">
        <aside className="rounded-lg border border-border bg-surface">
          <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted">
            Locations
          </p>
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">
              No locations yet — add an ICAO above.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {rows.map((r) => {
                const active = r.icao === selectedIcao
                return (
                  <li key={r.icao}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIcao(r.icao)
                        setError(null)
                      }}
                      className={[
                        'flex w-full items-baseline justify-between gap-2 px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'bg-gold/15 text-gold'
                          : 'text-cream hover:bg-surface-2',
                      ].join(' ')}
                    >
                      <span className="font-mono text-sm font-medium">
                        {r.icao}
                      </span>
                      <span className="truncate text-[11px] text-muted">
                        {r.operators.length} op
                        {r.operators.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
          {!selected ? (
            <p className="text-sm text-muted">
              Select a location to see its recommended call order.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-mono text-lg font-semibold text-cream">
                    {selected.icao}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {locationLabel(selected.icao)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    removeLocationRecommend(selected.icao)
                    setSelectedIcao(null)
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:border-late hover:text-late"
                >
                  Remove location
                </button>
              </div>

              <ol className="space-y-2">
                {selected.operators.length === 0 ? (
                  <li className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted">
                    No operators yet — add the first call below.
                  </li>
                ) : (
                  selected.operators.map((op, i) => (
                    <li
                      key={op.operator_id}
                      className="flex items-center gap-2 rounded-md border border-border bg-ink/40 px-3 py-2"
                    >
                      <span className="w-6 shrink-0 font-mono text-xs text-muted">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-cream">
                        {op.name}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() =>
                            moveLocationRecommendOperator(selected.icao, i, -1)
                          }
                          className="rounded border border-border px-2 py-1 text-xs text-muted enabled:hover:text-cream disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={i === selected.operators.length - 1}
                          onClick={() =>
                            moveLocationRecommendOperator(selected.icao, i, 1)
                          }
                          className="rounded border border-border px-2 py-1 text-xs text-muted enabled:hover:text-cream disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${op.name}`}
                          onClick={() =>
                            removeLocationRecommendOperator(
                              selected.icao,
                              op.operator_id,
                            )
                          }
                          className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-late hover:text-late"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ol>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Add operator to call order
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <OperatorSelect
                    label="Operator"
                    value={addOpName}
                    onChange={(name, hit) => {
                      setAddOpName(name)
                      setAddOpId(hit?.operator_id ?? null)
                    }}
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={addOperator}
                    className="shrink-0 rounded-md border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-medium text-gold hover:bg-gold/20"
                  >
                    Add to list
                  </button>
                </div>
                {error && selected ? (
                  <p className="mt-2 text-xs text-late">{error}</p>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
