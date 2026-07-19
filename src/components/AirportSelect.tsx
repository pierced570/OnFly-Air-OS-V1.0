import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  formatAirportLabel,
  formatAirportShort,
  lookupAirport,
  searchAirports,
  type AirportInfo,
} from '@/domain/airports'

type Props = {
  value: string
  onChange: (icao: string) => void
  label?: string
  placeholder?: string
  required?: boolean
  optional?: boolean
  className?: string
  inputClassName?: string
  allowUnknown?: boolean
}

/**
 * Searchable airport picker — ICAO + city, state (+ airport name).
 * Prevents fat-finger ICAO mistakes by forcing a visible place match.
 */
export function AirportSelect({
  value,
  onChange,
  label,
  placeholder = 'Search ICAO, IATA, city, or state…',
  required = false,
  optional = false,
  className = '',
  inputClassName = '',
  allowUnknown = false,
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const known = lookupAirport(value)

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

  const results = useMemo(() => searchAirports(q || value, 14), [q, value])

  const display = open
    ? q
    : known
      ? formatAirportShort(known)
      : value
        ? value.toUpperCase()
        : ''

  function pick(a: AirportInfo) {
    onChange(a.icao)
    setOpen(false)
    setQ('')
  }

  function onInput(raw: string) {
    setQ(raw)
    setOpen(true)
    if (allowUnknown) {
      const compact = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (/^[A-Z0-9]{3,4}$/.test(compact) && lookupAirport(compact)) {
        onChange(compact)
      } else if (!raw.trim()) {
        onChange('')
      }
    } else if (!raw.trim()) {
      onChange('')
    }
  }

  function onBlurCommit() {
    if (!allowUnknown) return
    const compact = (q || value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (/^[A-Z0-9]{3,4}$/.test(compact)) onChange(compact)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && (
        <span className="block text-xs font-medium uppercase tracking-wider text-muted">
          {label}
          {optional ? ' (optional)' : ''}
        </span>
      )}
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required={required && !optional}
        value={display}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => onInput(e.target.value)}
        onBlur={onBlurCommit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && results[0]) {
            e.preventDefault()
            pick(results[0])
          }
        }}
        className={[
          'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold',
          inputClassName,
        ].join(' ')}
      />
      {value && !known && (
        <p className="mt-1 text-[11px] text-late">
          {allowUnknown
            ? 'Not in catalog — double-check ICAO before dispatch.'
            : 'Pick an airport from the list (city/state shown).'}
        </p>
      )}
      {value && known && !open && (
        <p className="mt-1 truncate text-[11px] text-muted">{formatAirportLabel(known)}</p>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No airports match.</li>
          ) : (
            results.map((a) => (
              <li key={a.icao}>
                <button
                  type="button"
                  role="option"
                  aria-selected={a.icao === value.toUpperCase()}
                  className={[
                    'flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-surface-2',
                    a.icao === value.toUpperCase() ? 'bg-gold/10' : '',
                  ].join(' ')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(a)}
                >
                  <span className="avionic text-cream">
                    {a.icao}{' '}
                    <span className="font-sans text-gold">
                      — {a.city}, {a.state}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{a.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
