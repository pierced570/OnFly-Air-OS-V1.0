/**
 * Searchable aircraft type + tail pickers backed by the network AC database.
 * Scoped to the selected operator when known; free-text still allowed.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  isAssignableAircraftTail,
  normalizeAircraftTail,
} from '@/domain/aircraftTail'
import {
  ensureDeskAircraftLoaded,
  findDeskAircraftByTail,
  searchDeskAircraftTails,
  searchDeskAircraftTypes,
  type DeskAircraftHit,
} from '@/lib/deskAircraftSearch'
import { unifyAircraftType } from '@/lib/aircraftTypeCatalog'

const fieldDefault =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold'

type SharedProps = {
  operatorName?: string
  operatorId?: string | null
  className?: string
  inputClassName?: string
  required?: boolean
}

export function AircraftTypeFleetSelect({
  value,
  onChange,
  operatorName,
  operatorId,
  className,
  inputClassName,
  required = false,
  label = 'Aircraft type',
}: SharedProps & {
  value: string
  onChange: (typeName: string) => void
  label?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    void ensureDeskAircraftLoaded().then(() => setTick((n) => n + 1))
  }, [])

  useEffect(() => {
    if (!open) setQ('')
  }, [open, value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const results = useMemo(() => {
    void tick
    return searchDeskAircraftTypes(open ? q : '', {
      operatorName,
      operatorId,
      limit: 40,
    })
  }, [tick, open, q, operatorName, operatorId])

  const fleetTypeCount = useMemo(() => {
    void tick
    if (!operatorName?.trim() && !operatorId) return 0
    return searchDeskAircraftTypes('', {
      operatorName,
      operatorId,
      limit: 500,
    }).length
  }, [tick, operatorName, operatorId])

  useEffect(() => setActiveIdx(0), [q, open, operatorId, operatorName])

  const display = open ? q : value
  const scoped = fleetTypeCount > 0

  function pick(typeName: string) {
    onChange(unifyAircraftType(typeName) || typeName)
    setOpen(false)
    setQ('')
  }

  function commitTyped() {
    const raw = (q || value).trim()
    if (!raw) {
      onChange('')
      return
    }
    pick(raw)
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <label className="block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required}
          value={display}
          placeholder={scoped ? 'Search fleet types…' : 'Search aircraft types…'}
          onFocus={() => {
            setOpen(true)
            setQ(value)
          }}
          onChange={(e) => {
            const raw = e.target.value
            setQ(raw)
            setOpen(true)
            if (!raw.trim()) onChange('')
          }}
          onBlur={() => {
            // Commit typed value if it isn't an exact list pick yet.
            if (q.trim() && q.trim() !== value.trim()) commitTyped()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActiveIdx((i) =>
                Math.min(i + 1, Math.max(results.length - 1, 0)),
              )
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIdx((i) => Math.max(i - 1, 0))
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const hit = results[activeIdx] ?? results[0]
              if (hit) pick(hit)
              else commitTyped()
            }
          }}
          className={inputClassName?.trim() || fieldDefault}
        />
      </label>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface-2 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              No types match
              {q.trim() ? ` “${q.trim()}”` : ''}.
              {operatorName?.trim()
                ? ' Try clearing type or pick another operator.'
                : ''}
            </li>
          ) : (
            results.map((t, idx) => (
              <li key={t} role="option" aria-selected={idx === activeIdx}>
                <button
                  type="button"
                  className={[
                    'w-full px-3 py-2.5 text-left font-mono text-sm',
                    idx === activeIdx
                      ? 'bg-gold/15 text-cream'
                      : 'text-cream hover:bg-gold/10',
                  ].join(' ')}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(t)}
                >
                  {t}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {scoped && !open ? (
        <p className="mt-1 text-[11px] text-muted">From this operator’s fleet</p>
      ) : null}
    </div>
  )
}

export function AircraftTailFleetSelect({
  value,
  onChange,
  onPickAircraft,
  operatorName,
  operatorId,
  typeName,
  className,
  inputClassName,
  required = false,
  label = 'Tail number',
}: SharedProps & {
  value: string
  onChange: (tail: string) => void
  /** When a DB row is chosen, parent can autofill type. */
  onPickAircraft?: (hit: DeskAircraftHit) => void
  typeName?: string
  label?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    void ensureDeskAircraftLoaded().then(() => setTick((n) => n + 1))
  }, [])

  useEffect(() => {
    if (!open) setQ('')
  }, [open, value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const results = useMemo(() => {
    void tick
    return searchDeskAircraftTails(open ? q : '', {
      operatorName,
      operatorId,
      typeName: typeName?.trim() || null,
      limit: 40,
    })
  }, [tick, open, q, operatorName, operatorId, typeName])

  useEffect(() => setActiveIdx(0), [q, open, operatorId, typeName])

  const display = open ? q : value

  function pick(hit: DeskAircraftHit) {
    onChange(hit.tail)
    onPickAircraft?.(hit)
    setOpen(false)
    setQ('')
  }

  function commitTyped() {
    const raw = normalizeAircraftTail(q || value)
    if (!raw) {
      onChange('')
      return
    }
    const hit = findDeskAircraftByTail(raw, { operatorName, operatorId })
    if (hit) {
      pick(hit)
      return
    }
    onChange(raw)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <label className="block text-xs font-medium uppercase tracking-wider text-muted">
        {label} {required ? <span className="text-gold">*</span> : null}
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required}
          value={display}
          placeholder={
            operatorName?.trim() ? 'Search fleet tails…' : 'Search tails…'
          }
          onFocus={() => {
            setOpen(true)
            setQ(value)
          }}
          onChange={(e) => {
            const raw = e.target.value.toUpperCase()
            setQ(raw)
            setOpen(true)
            if (!raw.trim()) onChange('')
          }}
          onBlur={() => {
            if (q.trim() && normalizeAircraftTail(q) !== value) commitTyped()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActiveIdx((i) =>
                Math.min(i + 1, Math.max(results.length - 1, 0)),
              )
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIdx((i) => Math.max(i - 1, 0))
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const hit = results[activeIdx] ?? results[0]
              if (hit) pick(hit)
              else commitTyped()
            }
          }}
          className={
            (inputClassName?.trim() || fieldDefault) + ' avionic uppercase'
          }
        />
      </label>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface-2 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              No tails in AC database
              {operatorName?.trim() ? ' for this operator' : ''}
              {typeName?.trim() ? ` / ${typeName.trim()}` : ''}
              {q.trim() ? ` matching “${q.trim()}”` : ''}.
              {q.trim() && isAssignableAircraftTail(q) ? (
                <button
                  type="button"
                  className="mt-1 block text-gold hover:text-gold-lt"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitTyped()}
                >
                  Use {normalizeAircraftTail(q)}
                </button>
              ) : null}
            </li>
          ) : (
            results.map((hit, idx) => (
              <li
                key={hit.aircraft_id}
                role="option"
                aria-selected={idx === activeIdx}
              >
                <button
                  type="button"
                  className={[
                    'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left',
                    idx === activeIdx
                      ? 'bg-gold/15 text-cream'
                      : 'text-cream hover:bg-gold/10',
                  ].join(' ')}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(hit)}
                >
                  <span className="avionic text-sm font-semibold text-gold">
                    {hit.tail}
                  </span>
                  <span className="text-[11px] text-muted">
                    {[hit.type_name, hit.base_icao, hit.operator_name]
                      .filter(Boolean)
                      .join(' · ')}
                    {!hit.active ? ' · inactive' : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      <p className="mt-1 text-[11px] font-normal normal-case tracking-normal text-muted">
        Required for live ADS-B / portal track — not TBD.
      </p>
    </div>
  )
}
