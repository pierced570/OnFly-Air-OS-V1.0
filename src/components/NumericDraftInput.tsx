import { useEffect, useState, type InputHTMLAttributes } from 'react'
import {
  formatNumericDisplay,
  isDecimalDraft,
  parseDecimalDraft,
  sanitizeDecimalDraft,
} from '@/domain/numericDraft'

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  /** Stored numeric value. `null`/`undefined` display as blank. */
  value: number | null | undefined
  /** Fires as the user types. `null` when the field is empty or incomplete. */
  onValueChange: (next: number | null) => void
  /** Show blank instead of "0" when not focused. */
  blankZero?: boolean
  /** Digits only (no decimal point). */
  integer?: boolean
}

/**
 * Number field that never forces a sticky 0/1 when cleared.
 * Keeps a string draft while focused so deletions and intermediate decimals work.
 */
export function NumericDraftInput({
  value,
  onValueChange,
  blankZero = false,
  integer = false,
  onFocus,
  onBlur,
  className,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const external = formatNumericDisplay(value, { blankZero })

  useEffect(() => {
    if (!focused) setDraft(external)
  }, [external, focused])

  return (
    <input
      {...rest}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      className={className}
      value={focused ? draft : external}
      onFocus={(e) => {
        setFocused(true)
        setDraft(external)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        const parsed = parseDecimalDraft(draft, { integer })
        onValueChange(parsed)
        setFocused(false)
        onBlur?.(e)
      }}
      onChange={(e) => {
        const v = sanitizeDecimalDraft(e.target.value)
        if (!isDecimalDraft(v, integer)) return
        setDraft(v)
        onValueChange(parseDecimalDraft(v, { integer }))
      }}
    />
  )
}
