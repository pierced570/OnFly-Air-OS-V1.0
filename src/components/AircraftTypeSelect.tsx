/**
 * Dispatcher confirm control — pick a canonical aircraft type before
 * client-facing quote / invoice send. Free-text elsewhere can still draft;
 * this is the approve step.
 */

import { useMemo } from 'react'
import {
  aircraftTypeOptions,
  suggestAircraftTypeOption,
} from '@/lib/aircraftTypeCatalog'

const DEFAULT_LABEL = 'Aircraft type (confirm)'

type Props = {
  value: string
  onChange: (next: string) => void
  /** Seed options / suggestion from free-text drafts (Baron / KA90 / …). */
  draft?: string | null
  label?: string
  required?: boolean
  disabled?: boolean
  className?: string
  selectClassName?: string
  id?: string
}

export function AircraftTypeSelect({
  value,
  onChange,
  draft,
  label = DEFAULT_LABEL,
  required = true,
  disabled = false,
  className,
  selectClassName,
  id,
}: Props) {
  const options = useMemo(
    () => aircraftTypeOptions([draft, value]),
    [draft, value],
  )

  return (
    <label className={className ?? 'block text-xs text-muted'}>
      {label}
      <select
        id={id}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          selectClassName ??
          'mt-1 w-full rounded-md border border-border bg-panel px-3 py-2 font-mono text-sm text-cream outline-none focus:border-gold'
        }
      >
        <option value="">Confirm aircraft type…</option>
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {draft?.trim() &&
      value &&
      draft.trim().toLowerCase() !== value.toLowerCase() ? (
        <span className="mt-1 block font-mono text-[11px] text-gold/80">
          Draft was {draft.trim()}
        </span>
      ) : null}
    </label>
  )
}

/** Prefill helper for parent state init / effect. */
export function initialAircraftTypeSelectValue(
  draft: string | null | undefined,
): string {
  return suggestAircraftTypeOption(draft)
}
