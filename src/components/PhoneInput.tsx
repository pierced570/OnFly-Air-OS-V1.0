import { useEffect, useState } from 'react'
import {
  PHONE_COUNTRIES,
  formatNationalDisplay,
  nationalDigitsInput,
  parsePhoneValue,
  phoneCountryByIso,
  phoneCountryOptionLabel,
  toE164,
} from '@/domain/phoneFormat'
import {
  formatPhoneDisplay,
  phoneDigitsInput,
} from '@/domain/staffAccess'

type Props = {
  value: string
  /**
   * US-only mode (default): emits national 10 digits for staff/operator callers.
   * International: country selector + emits E.164 (`+...`).
   */
  international?: boolean
  onChange: (value: string) => void
  className?: string
  /** Applied to the wrapping row when international (select + input). */
  rowClassName?: string
  selectClassName?: string
  placeholder?: string
  required?: boolean
  autoComplete?: string
  id?: string
  name?: string
  disabled?: boolean
  /** Default / preferred ISO when value is empty or ambiguous (+1). */
  defaultCountry?: string
}

/**
 * Phone field with type-as-you-go formatting.
 * - Default: US (XXX) XXX-XXXX, digits-only callback (legacy staff/ops).
 * - `international`: country dial selector + E.164 callback.
 */
export default function PhoneInput({
  value,
  onChange,
  international = false,
  className,
  rowClassName,
  selectClassName,
  placeholder,
  required,
  autoComplete = 'tel',
  id,
  name,
  disabled,
  defaultCountry = 'US',
}: Props) {
  if (!international) {
    const display = formatPhoneDisplay(value)
    return (
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className={className}
        placeholder={placeholder ?? '(555) 555-5555'}
        value={display}
        onChange={(e) => onChange(phoneDigitsInput(e.target.value))}
        onPaste={(e) => {
          e.preventDefault()
          const pasted = e.clipboardData.getData('text')
          onChange(phoneDigitsInput(pasted))
        }}
      />
    )
  }

  return (
    <InternationalPhoneInput
      value={value}
      onChange={onChange}
      className={className}
      rowClassName={rowClassName}
      selectClassName={selectClassName}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      id={id}
      name={name}
      disabled={disabled}
      defaultCountry={defaultCountry}
    />
  )
}

function InternationalPhoneInput({
  value,
  onChange,
  className,
  rowClassName,
  selectClassName,
  placeholder,
  required,
  autoComplete = 'tel',
  id,
  name,
  disabled,
  defaultCountry = 'US',
}: Omit<Props, 'international'>) {
  const initial = parsePhoneValue(value, defaultCountry)
  const [iso, setIso] = useState(initial.iso || defaultCountry)
  const [national, setNational] = useState(initial.national)

  // Sync from parent when value changes externally (profile prefills, reset).
  useEffect(() => {
    const parsed = parsePhoneValue(value, iso || defaultCountry)
    if (!value.trim()) {
      if (national) setNational('')
      return
    }
    if (parsed.e164 && parsed.e164 !== toE164(national, iso)) {
      setIso(parsed.iso)
      setNational(parsed.national)
    } else if (!value.startsWith('+') && digitsDiffer(value, national)) {
      // Raw national / legacy paste into controlled value
      const next = nationalDigitsInput(value, iso)
      if (next !== national) setNational(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional external sync
  }, [value])

  const country = phoneCountryByIso(iso)
  const display = formatNationalDisplay(national, iso)

  function emit(nextIso: string, nextNational: string) {
    setIso(nextIso)
    setNational(nextNational)
    onChange(toE164(nextNational, nextIso))
  }

  return (
    <div
      className={
        rowClassName ??
        'flex min-w-0 overflow-hidden rounded-md border border-border focus-within:border-gold'
      }
    >
      <label className="sr-only" htmlFor={id ? `${id}-country` : undefined}>
        Country code
      </label>
      <select
        id={id ? `${id}-country` : undefined}
        disabled={disabled}
        aria-label="Country code"
        className={
          selectClassName ??
          'shrink-0 border-0 border-r border-border bg-transparent px-2 py-2.5 text-sm outline-none'
        }
        value={iso}
        onChange={(e) => {
          const nextIso = e.target.value
          const capped = nationalDigitsInput(
            national,
            nextIso,
          ).slice(0, phoneCountryByIso(nextIso).nationalMax)
          emit(nextIso, capped)
        }}
      >
        {PHONE_COUNTRIES.map((c) => (
          <option key={c.iso} value={c.iso}>
            {phoneCountryOptionLabel(c)}
          </option>
        ))}
      </select>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className={
          className ??
          'min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 font-mono text-sm outline-none'
        }
        placeholder={
          placeholder ??
          (country.dial === '1' ? '(555) 555-5555' : 'Phone number')
        }
        value={display}
        onChange={(e) => {
          emit(iso, nationalDigitsInput(e.target.value, iso))
        }}
        onPaste={(e) => {
          e.preventDefault()
          const pasted = e.clipboardData.getData('text')
          const parsed = parsePhoneValue(pasted, iso)
          if (pasted.trim().startsWith('+') && parsed.national) {
            emit(parsed.iso, parsed.national)
            return
          }
          emit(iso, nationalDigitsInput(pasted, iso))
        }}
      />
    </div>
  )
}

function digitsDiffer(a: string, b: string): boolean {
  return a.replace(/\D/g, '') !== b.replace(/\D/g, '')
}
