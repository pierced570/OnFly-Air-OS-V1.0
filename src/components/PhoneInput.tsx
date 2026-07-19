import { formatPhoneDisplay, phoneDigitsInput } from '@/domain/staffAccess'

type Props = {
  value: string
  onChange: (digits: string) => void
  className?: string
  placeholder?: string
  required?: boolean
  autoComplete?: string
  id?: string
  name?: string
  disabled?: boolean
}

/**
 * US phone field: digits only under the hood; displays (XXX) XXX-XXXX.
 * Callers should store/compare via the digits callback (normalizePhone).
 */
export default function PhoneInput({
  value,
  onChange,
  className,
  placeholder = '(555) 555-5555',
  required,
  autoComplete = 'tel',
  id,
  name,
  disabled,
}: Props) {
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
      placeholder={placeholder}
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
