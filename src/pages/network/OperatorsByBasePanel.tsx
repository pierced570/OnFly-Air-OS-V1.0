/**
 * Network → Operators → By bases — operators grouped by base ICAO.
 */

import type { OperatorsByBaseView } from '@/domain/operatorsByBase'

export function OperatorsByBasePanel({
  view,
  selectedBase,
  onSelectBase,
  selectedOpId,
  onSelectOperator,
  filter,
  onFilterChange,
}: {
  view: OperatorsByBaseView
  selectedBase: string | null
  onSelectBase: (icao: string) => void
  selectedOpId: string | null
  onSelectOperator: (id: string | null) => void
  filter: string
  onFilterChange: (q: string) => void
}) {
  const needle = filter.trim().toLowerCase()
  const operators = (view.selected?.operators ?? []).filter((op) => {
    if (!needle) return true
    return (
      op.name.toLowerCase().includes(needle) ||
      op.base_icao.toLowerCase().includes(needle) ||
      op.city.toLowerCase().includes(needle)
    )
  })

  const baseHits = view.bases.filter((b) => {
    if (!needle) return true
    return (
      b.icao.toLowerCase().includes(needle) ||
      b.city.toLowerCase().includes(needle) ||
      b.state.toLowerCase().includes(needle) ||
      b.label.toLowerCase().includes(needle)
    )
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-xs text-muted">
            Filter bases / operators
            <input
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="ICAO / city / operator…"
              className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
            />
          </label>
          {view.unknown_count > 0 && (
            <p className="text-[11px] text-muted">
              <span className="avionic text-cream">{view.unknown_count}</span>{' '}
              without a base ICAO
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">
            Bases
          </p>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {baseHits.length === 0 ? (
              <p className="text-sm text-muted">No bases match.</p>
            ) : (
              baseHits.map((b) => {
                const active = selectedBase === b.icao
                return (
                  <button
                    key={b.icao}
                    type="button"
                    onClick={() => onSelectBase(b.icao)}
                    className={[
                      'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                      active
                        ? 'border-gold/50 bg-gold/15 text-gold'
                        : 'border-border bg-ink text-muted hover:text-cream',
                    ].join(' ')}
                  >
                    <span className="avionic font-medium">{b.icao}</span>
                    {(b.city || b.state) && (
                      <span className="ml-1.5 text-[11px] opacity-80">
                        {[b.city, b.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                    <span className="ml-1.5 avionic opacity-70">
                      {b.operator_count}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-cream">
            {view.selected ? view.selected.label : 'Select a base'}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {view.selected ? (
              <>
                <span className="avionic text-cream">{operators.length}</span>{' '}
                operator{operators.length === 1 ? '' : 's'}
              </>
            ) : (
              'Pick a base ICAO to see who is based there.'
            )}
          </p>
        </header>

        {!view.selected ? null : operators.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            No operators at this base
            {needle ? ' match the filter' : ''}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {operators.map((op, idx) => {
              const active = selectedOpId === op.id
              return (
                <li key={op.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectOperator(active ? null : op.id)
                    }
                    className={[
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      active ? 'bg-gold/10' : 'hover:bg-surface-2',
                    ].join(' ')}
                  >
                    <span className="avionic w-6 shrink-0 pt-0.5 text-xs text-muted">
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-cream">
                        {op.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        <span className="avionic text-cream">
                          {op.base_icao}
                        </span>
                        {op.aircraft_count > 0 ? (
                          <>
                            {' · '}
                            <span className="avionic">
                              {op.aircraft_count}
                            </span>{' '}
                            aircraft
                          </>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
