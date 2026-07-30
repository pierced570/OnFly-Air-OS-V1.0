/**
 * Multi-country phone dialing + type-as-you-go national formatting.
 * Storage preference: E.164 (`+16105092031`). US/CA national display: (XXX) XXX-XXXX.
 */

export type PhoneCountry = {
  /** ISO 3166-1 alpha-2 */
  iso: string
  /** Human label for the selector */
  name: string
  /** Digits only, no + */
  dial: string
  /** Max national significant number length (approx) */
  nationalMax: number
}

/** Common destinations for OnFly freight clients / ops. US first. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: 'US', name: 'United States', dial: '1', nationalMax: 10 },
  { iso: 'CA', name: 'Canada', dial: '1', nationalMax: 10 },
  { iso: 'MX', name: 'Mexico', dial: '52', nationalMax: 10 },
  { iso: 'GB', name: 'United Kingdom', dial: '44', nationalMax: 10 },
  { iso: 'IE', name: 'Ireland', dial: '353', nationalMax: 9 },
  { iso: 'DE', name: 'Germany', dial: '49', nationalMax: 11 },
  { iso: 'FR', name: 'France', dial: '33', nationalMax: 9 },
  { iso: 'NL', name: 'Netherlands', dial: '31', nationalMax: 9 },
  { iso: 'BE', name: 'Belgium', dial: '32', nationalMax: 9 },
  { iso: 'CH', name: 'Switzerland', dial: '41', nationalMax: 9 },
  { iso: 'ES', name: 'Spain', dial: '34', nationalMax: 9 },
  { iso: 'IT', name: 'Italy', dial: '39', nationalMax: 10 },
  { iso: 'PT', name: 'Portugal', dial: '351', nationalMax: 9 },
  { iso: 'AT', name: 'Austria', dial: '43', nationalMax: 10 },
  { iso: 'SE', name: 'Sweden', dial: '46', nationalMax: 9 },
  { iso: 'NO', name: 'Norway', dial: '47', nationalMax: 8 },
  { iso: 'DK', name: 'Denmark', dial: '45', nationalMax: 8 },
  { iso: 'FI', name: 'Finland', dial: '358', nationalMax: 10 },
  { iso: 'PL', name: 'Poland', dial: '48', nationalMax: 9 },
  { iso: 'CZ', name: 'Czechia', dial: '420', nationalMax: 9 },
  { iso: 'AU', name: 'Australia', dial: '61', nationalMax: 9 },
  { iso: 'NZ', name: 'New Zealand', dial: '64', nationalMax: 9 },
  { iso: 'JP', name: 'Japan', dial: '81', nationalMax: 10 },
  { iso: 'KR', name: 'South Korea', dial: '82', nationalMax: 10 },
  { iso: 'CN', name: 'China', dial: '86', nationalMax: 11 },
  { iso: 'HK', name: 'Hong Kong', dial: '852', nationalMax: 8 },
  { iso: 'SG', name: 'Singapore', dial: '65', nationalMax: 8 },
  { iso: 'IN', name: 'India', dial: '91', nationalMax: 10 },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', nationalMax: 9 },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966', nationalMax: 9 },
  { iso: 'IL', name: 'Israel', dial: '972', nationalMax: 9 },
  { iso: 'ZA', name: 'South Africa', dial: '27', nationalMax: 9 },
  { iso: 'BR', name: 'Brazil', dial: '55', nationalMax: 11 },
  { iso: 'AR', name: 'Argentina', dial: '54', nationalMax: 10 },
  { iso: 'CL', name: 'Chile', dial: '56', nationalMax: 9 },
  { iso: 'CO', name: 'Colombia', dial: '57', nationalMax: 10 },
  { iso: 'PE', name: 'Peru', dial: '51', nationalMax: 9 },
  { iso: 'CR', name: 'Costa Rica', dial: '506', nationalMax: 8 },
  { iso: 'PA', name: 'Panama', dial: '507', nationalMax: 8 },
  { iso: 'DO', name: 'Dominican Republic', dial: '1', nationalMax: 10 },
  { iso: 'PR', name: 'Puerto Rico', dial: '1', nationalMax: 10 },
] as const

export function phoneCountryByIso(iso: string): PhoneCountry {
  return (
    PHONE_COUNTRIES.find((c) => c.iso === iso.toUpperCase()) ??
    PHONE_COUNTRIES[0]!
  )
}

/** Digits only. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Infer country + national digits from a stored value (E.164, national, or junk).
 * Prefers explicit `preferredIso` when dial codes collide (US/CA/+1).
 */
export function parsePhoneValue(
  raw: string,
  preferredIso = 'US',
): { iso: string; national: string; e164: string } {
  const preferred = phoneCountryByIso(preferredIso)
  const trimmed = raw.trim()
  if (!trimmed) {
    return { iso: preferred.iso, national: '', e164: '' }
  }

  const hasPlus = trimmed.startsWith('+')
  let d = digitsOnly(trimmed)

  // Longest dial-code match when value looks international.
  if (hasPlus || d.length > preferred.nationalMax) {
    const sorted = [...PHONE_COUNTRIES].sort(
      (a, b) => b.dial.length - a.dial.length,
    )
    for (const c of sorted) {
      if (!d.startsWith(c.dial)) continue
      // Ambiguous +1: keep preferred NANP country when preferred is also +1.
      if (c.dial === '1' && preferred.dial === '1') {
        const national = d.slice(1).slice(0, preferred.nationalMax)
        return {
          iso: preferred.iso,
          national,
          e164: national ? `+1${national}` : '',
        }
      }
      const national = d.slice(c.dial.length).slice(0, c.nationalMax)
      return {
        iso: c.iso,
        national,
        e164: national ? `+${c.dial}${national}` : '',
      }
    }
  }

  // US/CA style: 11 digits starting with 1 → drop trunk.
  if (preferred.dial === '1' && d.length === 11 && d.startsWith('1')) {
    d = d.slice(1)
  }

  const national = d.slice(0, preferred.nationalMax)
  return {
    iso: preferred.iso,
    national,
    e164: national ? `+${preferred.dial}${national}` : '',
  }
}

/** Cap national digits for the selected country (strip leading 0 trunk where common). */
export function nationalDigitsInput(
  raw: string,
  iso: string,
): string {
  const country = phoneCountryByIso(iso)
  let d = digitsOnly(raw)
  // Pasted E.164 / full international into the national field.
  if (raw.trim().startsWith('+') || d.startsWith(country.dial)) {
    const parsed = parsePhoneValue(raw, iso)
    if (parsed.iso === iso || parsed.national) {
      return parsed.national.slice(0, country.nationalMax)
    }
  }
  // NANP: allow typing/pasting 1XXXXXXXXXX
  if (country.dial === '1' && d.length === 11 && d.startsWith('1')) {
    d = d.slice(1)
  }
  // Many EU mobiles: drop a single leading 0 when pasting local format.
  if (
    country.dial !== '1' &&
    d.startsWith('0') &&
    d.length > country.nationalMax
  ) {
    d = d.slice(1)
  }
  return d.slice(0, country.nationalMax)
}

/** Type-as-you-go national display for the selected country. */
export function formatNationalDisplay(national: string, iso: string): string {
  const d = digitsOnly(national)
  if (!d) return ''
  const country = phoneCountryByIso(iso)

  if (country.dial === '1') {
    // NANP: (XXX) XXX-XXXX
    if (d.length <= 3) return `(${d}`
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`
  }

  if (country.iso === 'GB') {
    // UK mobile-ish: XXXX XXXXXX
    if (d.length <= 4) return d
    return `${d.slice(0, 4)} ${d.slice(4)}`
  }

  if (country.iso === 'FR' || country.iso === 'CH') {
    // XX XX XX XX XX
    const parts: string[] = []
    for (let i = 0; i < d.length; i += 2) parts.push(d.slice(i, i + 2))
    return parts.join(' ')
  }

  if (country.iso === 'DE' || country.iso === 'AU') {
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
    if (d.length <= 10) {
      return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
    }
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)} ${d.slice(10)}`
  }

  if (country.iso === 'BR') {
    // (XX) XXXXX-XXXX / (XX) XXXX-XXXX
    if (d.length <= 2) return `(${d}`
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
    if (d.length <= 10) {
      return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    }
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
  }

  if (country.iso === 'MX') {
    if (d.length <= 2) return d
    if (d.length <= 6) return `${d.slice(0, 2)} ${d.slice(2)}`
    return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6, 10)}`
  }

  // Generic: groups of 3–4
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

export function toE164(national: string, iso: string): string {
  const country = phoneCountryByIso(iso)
  const d = digitsOnly(national).slice(0, country.nationalMax)
  if (!d) return ''
  return `+${country.dial}${d}`
}

/** Selector label: 🇺🇸 +1 */
export function phoneCountryOptionLabel(c: PhoneCountry): string {
  return `${c.iso} +${c.dial}`
}
