import { describe, expect, it } from 'vitest'
import {
  formatNationalDisplay,
  nationalDigitsInput,
  parsePhoneValue,
  phoneCountryByIso,
  toE164,
} from './phoneFormat'

describe('phoneFormat', () => {
  it('formats NANP as (XXX) XXX-XXXX while typing', () => {
    expect(formatNationalDisplay('6', 'US')).toBe('(6')
    expect(formatNationalDisplay('610', 'US')).toBe('(610')
    expect(formatNationalDisplay('6105', 'US')).toBe('(610) 5')
    expect(formatNationalDisplay('6105092031', 'US')).toBe('(610) 509-2031')
    expect(formatNationalDisplay('6105092031', 'CA')).toBe('(610) 509-2031')
  })

  it('strips leading 1 when pasting 11-digit NANP', () => {
    expect(nationalDigitsInput('16105092031', 'US')).toBe('6105092031')
    expect(nationalDigitsInput('+1 (610) 509-2031', 'US')).toBe('6105092031')
  })

  it('builds E.164 from country + national', () => {
    expect(toE164('6105092031', 'US')).toBe('+16105092031')
    expect(toE164('7911123456', 'GB')).toBe('+447911123456')
    expect(toE164('612345678', 'FR')).toBe('+33612345678')
  })

  it('parses E.164 back to country + national', () => {
    expect(parsePhoneValue('+16105092031', 'US')).toMatchObject({
      iso: 'US',
      national: '6105092031',
      e164: '+16105092031',
    })
    expect(parsePhoneValue('+447911123456')).toMatchObject({
      iso: 'GB',
      national: '7911123456',
      e164: '+447911123456',
    })
  })

  it('keeps preferred NANP country for +1 numbers', () => {
    expect(parsePhoneValue('+16105092031', 'CA').iso).toBe('CA')
    expect(parsePhoneValue('6105092031', 'US').iso).toBe('US')
  })

  it('formats UK / FR / BR displays', () => {
    expect(formatNationalDisplay('7911123456', 'GB')).toBe('7911 123456')
    expect(formatNationalDisplay('612345678', 'FR')).toBe('61 23 45 67 8')
    expect(formatNationalDisplay('11987654321', 'BR')).toBe('(11) 98765-4321')
  })

  it('resolves country catalog entries', () => {
    expect(phoneCountryByIso('mx').dial).toBe('52')
    expect(phoneCountryByIso('nope').iso).toBe('US')
  })
})
