/**
 * Quick Dispatch / desk operator picker — canonical names from the network
 * (+ desk-added). Uniform spelling; Add new when missing.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  addDeskOperator,
  ensureDeskOperatorsLoaded,
  listDeskOperators,
  toDeskOperatorHit,
  type DeskOperatorHit,
} from '@/lib/deskOperatorSearch'

const ADD_NEW = '__add_new__'

type Props = {
  value: string
  onChange: (name: string, hit?: DeskOperatorHit | null) => void
  label?: string
  className?: string
  selectClassName?: string
  required?: boolean
}

export function OperatorSelect({
  value,
  onChange,
  label = 'Operator / Vendor',
  className,
  selectClassName,
  required = false,
}: Props) {
  const [tick, setTick] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    void ensureDeskOperatorsLoaded().then(() => setTick((n) => n + 1))
  }, [])

  const options = useMemo(() => {
    void tick
    return listDeskOperators()
      .map((o) => o.name.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [tick])

  /** Match free-text / prior value to a canonical option (case-insensitive). */
  const selectValue = useMemo(() => {
    const v = value.trim()
    if (!v) return ''
    const hit = options.find((n) => n.toLowerCase() === v.toLowerCase())
    return hit ?? ''
  }, [value, options])

  function pick(name: string) {
    const op = listDeskOperators().find(
      (o) => o.name.trim().toLowerCase() === name.trim().toLowerCase(),
    )
    onChange(op?.name.trim() || name.trim(), op ? toDeskOperatorHit(op) : null)
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
      pick(existing.name)
      setShowNew(false)
      setNewName('')
      return
    }
    try {
      const hit = addDeskOperator({ name })
      setTick((n) => n + 1)
      onChange(hit.name, hit)
      setShowNew(false)
      setNewName('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className={className}>
      <label className="block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
        <select
          required={required}
          value={showNew ? ADD_NEW : selectValue}
          onChange={(e) => {
            const v = e.target.value
            if (v === ADD_NEW) {
              setShowNew(true)
              setNewName(value.trim())
              return
            }
            setShowNew(false)
            setAddError(null)
            if (!v) {
              onChange('', null)
              return
            }
            pick(v)
          }}
          className={
            selectClassName ??
            'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold'
          }
        >
          <option value="">Select operator…</option>
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new operator…</option>
        </select>
      </label>

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
              className="flex-1 rounded-md bg-gold py-2 text-sm font-medium text-ink"
              onClick={submitNew}
            >
              Save operator
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-cream"
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
