/**
 * Quick Dispatch / desk operator picker — searchable combobox over network
 * (+ desk-added). Uniform spelling; Add new when missing.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  addDeskOperator,
  ensureDeskOperatorsLoaded,
  listDeskOperators,
  searchDeskOperators,
  toDeskOperatorHit,
  type DeskOperatorHit,
} from '@/lib/deskOperatorSearch'

type Props = {
  value: string
  onChange: (name: string, hit?: DeskOperatorHit | null) => void
  label?: string
  className?: string
  /** @deprecated Prefer inputClassName — kept for callers that styled the old <select>. */
  selectClassName?: string
  inputClassName?: string
  required?: boolean
  placeholder?: string
}

export function OperatorSelect({
  value,
  onChange,
  label = 'Operator / Vendor',
  className,
  selectClassName,
  inputClassName,
  required = false,
  placeholder = 'Search operator…',
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    void ensureDeskOperatorsLoaded().then(() => setTick((n) => n + 1))
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
    // Empty query → browse list; typed query → filter name/base/contact.
    return searchDeskOperators(open ? q : value, 40)
  }, [tick, open, q, value])

  useEffect(() => {
    setActiveIdx(0)
  }, [q, open])

  const display = open ? q : value

  function pick(hit: DeskOperatorHit) {
    onChange(hit.name, hit)
    setOpen(false)
    setQ('')
    setShowNew(false)
    setAddError(null)
  }

  function submitNew() {
    setAddError(null)
    const name = newName.trim()
    if (!name) {
      setAddError('Operator name required')
      return
    }
    const existing = listDeskOperators().find(
      (o) => o.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      pick(toDeskOperatorHit(existing))
      setNewName('')
      return
    }
    try {
      const hit = addDeskOperator({ name })
      setTick((n) => n + 1)
      pick(hit)
      setNewName('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    }
  }

  const fieldClass =
    inputClassName?.trim() ||
    selectClassName?.trim() ||
    'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold'

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
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true)
            setQ(value)
          }}
          onChange={(e) => {
            const raw = e.target.value
            setQ(raw)
            setOpen(true)
            if (!raw.trim()) onChange('', null)
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
              else if (q.trim()) {
                setShowNew(true)
                setNewName(q.trim())
                setOpen(false)
              }
            }
          }}
          className={fieldClass}
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
              No operators match
              {q.trim() ? ` “${q.trim()}”` : ''}.
            </li>
          ) : (
            results.map((hit, idx) => (
              <li key={hit.operator_id} role="option" aria-selected={idx === activeIdx}>
                <button
                  type="button"
                  className={[
                    'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm',
                    idx === activeIdx
                      ? 'bg-gold/15 text-cream'
                      : 'text-cream hover:bg-gold/10',
                  ].join(' ')}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(hit)}
                >
                  <span className="font-medium">{hit.name}</span>
                  <span className="text-[11px] text-muted">
                    {[
                      hit.base_icao,
                      hit.tail,
                      hit.type_name,
                      hit.contact_cell || hit.contact_email || null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Network operator'}
                  </span>
                </button>
              </li>
            ))
          )}
          <li className="border-t border-border">
            <button
              type="button"
              className="w-full px-3 py-2.5 text-left text-sm font-medium text-gold hover:bg-gold/10"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowNew(true)
                setNewName(q.trim() || value.trim())
                setOpen(false)
              }}
            >
              + Add new operator…
            </button>
          </li>
        </ul>
      ) : null}

      {value && !open && !showNew ? (
        <p className="mt-1 truncate text-[11px] text-muted">
          {(() => {
            const op = listDeskOperators().find(
              (o) => o.name.trim().toLowerCase() === value.trim().toLowerCase(),
            )
            if (!op) return 'Custom / free-text operator'
            const hit = toDeskOperatorHit(op)
            return (
              [hit.base_icao, hit.tail, hit.type_name]
                .filter(Boolean)
                .join(' · ') || 'Network operator'
            )
          })()}
        </p>
      ) : null}

      {showNew ? (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface p-3">
          <input
            autoFocus
            className="w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold placeholder:text-muted"
            placeholder="Operator name (exact spelling)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitNew()
              }
            }}
          />
          {addError ? (
            <p className="text-xs text-late">{addError}</p>
          ) : (
            <p className="text-[11px] text-muted">
              Saved for this desk — use the same spelling next time.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 flex-1 rounded-md bg-gold py-2 text-sm font-medium text-ink"
              onClick={submitNew}
            >
              Save operator
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-cream"
              onClick={() => {
                setShowNew(false)
                setNewName('')
                setAddError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
