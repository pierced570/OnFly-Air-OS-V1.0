/**
 * Network → Operators → By state — operators grouped by base airport state,
 * with suggestions for contiguous (touching) nearby states.
 */

import type { OperatorsByStateView } from '@/domain/operatorsByState'

export function OperatorsByStatePanel({
  view,
  selectedState,
  onSelectState,
  selectedOpId,
  onSelectOperator,
  filter,
  onFilterChange,
}: {
  view: OperatorsByStateView
  selectedState: string | null
  onSelectState: (code: string) => void
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-xs text-muted">
            Filter operators
            <input
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="Name / ICAO / city…"
              className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
            />
          </label>
          {view.unknown_count > 0 && (
            <p className="text-[11px] text-muted">
              <span className="avionic text-cream">{view.unknown_count}</span>{' '}
              without a resolvable base state
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">
            States with operators
          </p>
          <div className="flex flex-wrap gap-1.5">
            {view.states_with_operators.length === 0 ? (
              <p className="text-sm text-muted">No base states on file yet.</p>
            ) : (
              view.states_with_operators.map((s) => {
                const active = selectedState === s.state
                return (
                  <button
                    key={s.state}
                    type="button"
                    onClick={() => onSelectState(s.state)}
                    className={[
                      'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                      active
                        ? 'border-gold/50 bg-gold/15 text-gold'
                        : 'border-border bg-ink text-muted hover:text-cream',
                    ].join(' ')}
                  >
                    <span className="avionic font-medium">{s.state}</span>
                    <span className="ml-1.5 text-[11px] opacity-80">
                      {s.label}
                    </span>
                    <span className="ml-1.5 avionic opacity-70">
                      {s.operator_count}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {view.selected && view.nearby.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted">
              Nearby · touching {view.selected.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {view.nearby.map((n) => {
                const active = selectedState === n.state
                return (
                  <button
                    key={n.state}
                    type="button"
                    onClick={() => onSelectState(n.state)}
                    className={[
                      'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                      active
                        ? 'border-gold/50 bg-gold/15 text-gold'
                        : n.has_operators
                          ? 'border-border bg-ink text-cream hover:border-gold/40'
                          : 'border-border/60 bg-ink/50 text-muted',
                    ].join(' ')}
                    title={
                      n.has_operators
                        ? `${n.operator_count} operator${n.operator_count === 1 ? '' : 's'}`
                        : 'No operators based here yet'
                    }
                  >
                    <span className="avionic font-medium">{n.state}</span>
                    <span className="ml-1.5 text-[11px] opacity-80">
                      {n.label}
                    </span>
                    <span
                      className={[
                        'ml-1.5 avionic',
                        n.has_operators ? 'text-gold' : 'opacity-50',
                      ].join(' ')}
                    >
                      {n.operator_count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <section className="rounded-lg border border-border bg-surface">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-cream">
            {view.selected
              ? `${view.selected.label} (${view.selected.state})`
              : 'Select a state'}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {view.selected ? (
              <>
                <span className="avionic text-cream">{operators.length}</span>{' '}
                operator{operators.length === 1 ? '' : 's'}
                {needle ? ' matching filter' : ' based here'}
              </>
            ) : (
              'Pick a state above to see who is based there.'
            )}
          </p>
        </header>

        {!view.selected ? null : operators.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {needle
              ? 'No operators match this filter in this state.'
              : 'No operators based in this state yet — try a nearby state above.'}
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
                        {op.city ? ` · ${op.city}` : ''}
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
