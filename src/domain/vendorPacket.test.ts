import { describe, expect, it } from 'vitest'
import {
  digitsOnly,
  emptyVendorPacketDraft,
  formatTinDisplay,
  validateVendorPacket,
  type VendorPacketDraft,
} from './vendorPacket'

function validDraft(
  overrides?: Partial<VendorPacketDraft>,
): VendorPacketDraft {
  return {
    ...emptyVendorPacketDraft(),
    legal_name: 'Sonrise Aviation LLC',
    tax_classification: 'llc',
    llc_classification: 's_corp',
    address: {
      street: '100 Ramp Way',
      city: 'Fort Wayne',
      state: 'IN',
      zip: '46809',
    },
    tin_type: 'ein',
    tin: '12-3456789',
    ap_name: 'AP Desk',
    ap_email: 'ap@sonrise.example',
    ap_phone: '2605550100',
    bank_name: 'First National',
    bank_routing: '021000021',
    bank_account: '123456789',
    account_type: 'checking',
    certified: true,
    signer_name: 'Alex Pilot',
    signer_title: 'Controller',
    w9_file_name: 'w9-sonrise.pdf',
    ...overrides,
  }
}

describe('vendorPacket', () => {
  it('digitsOnly strips punctuation', () => {
    expect(digitsOnly('12-3456789')).toBe('123456789')
    expect(digitsOnly('021-000-021')).toBe('021000021')
  })

  it('formatTinDisplay masks SSN and formats EIN', () => {
    expect(formatTinDisplay('123456789', 'ein')).toBe('12-3456789')
    expect(formatTinDisplay('123456789', 'ssn')).toBe('***-**-6789')
  })

  it('accepts a complete packet', () => {
    const v = validateVendorPacket(validDraft())
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual([])
    expect(v.flags).toEqual([])
  })

  it('requires certification, TIN, routing, and classification', () => {
    const v = validateVendorPacket(
      validDraft({
        certified: false,
        tin: '12',
        bank_routing: '123',
        tax_classification: '',
      }),
    )
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => /certification/i.test(e))).toBe(true)
    expect(v.errors.some((e) => /EIN/i.test(e))).toBe(true)
    expect(v.errors.some((e) => /routing/i.test(e))).toBe(true)
    expect(v.errors.some((e) => /classification/i.test(e))).toBe(true)
  })

  it('flags missing W-9 upload without blocking', () => {
    const v = validateVendorPacket(validDraft({ w9_file_name: '' }))
    expect(v.ok).toBe(true)
    expect(v.flags).toContain('w9_file')
  })

  it('requires LLC classification when LLC selected', () => {
    const v = validateVendorPacket(
      validDraft({ llc_classification: '' }),
    )
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => /LLC/i.test(e))).toBe(true)
  })
})
