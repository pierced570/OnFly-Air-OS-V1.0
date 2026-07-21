/**
 * W-9 + vendor banking packet — pure TypeScript (no React / Supabase).
 * Public form at /vendor; dispatcher reviews before AP uses the data.
 */

export const TAX_CLASSIFICATIONS = [
  'individual',
  'c_corp',
  's_corp',
  'partnership',
  'trust_estate',
  'llc',
  'other',
] as const

export type TaxClassification = (typeof TAX_CLASSIFICATIONS)[number]

export const LLC_TAX_CLASSIFICATIONS = [
  'c_corp',
  's_corp',
  'partnership',
] as const

export type LlcTaxClassification = (typeof LLC_TAX_CLASSIFICATIONS)[number]

export const TIN_TYPES = ['ein', 'ssn'] as const
export type TinType = (typeof TIN_TYPES)[number]

export const ACCOUNT_TYPES = ['checking', 'savings'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const VENDOR_KINDS = ['operator', 'fbo', 'other'] as const
export type VendorKind = (typeof VENDOR_KINDS)[number]

export type VendorAddress = {
  street: string
  city: string
  state: string
  zip: string
}

export type VendorPacketDraft = {
  /** Who is filling this out for OnFly AP */
  vendor_kind: VendorKind
  legal_name: string
  dba: string
  tax_classification: TaxClassification | ''
  llc_classification: LlcTaxClassification | ''
  other_classification: string
  address: VendorAddress
  remit_different: boolean
  remit_address: VendorAddress
  tin_type: TinType
  /** Digits only — EIN (9) or SSN (9). Never log in UI events. */
  tin: string
  ap_name: string
  ap_email: string
  ap_phone: string
  bank_name: string
  bank_routing: string
  bank_account: string
  account_type: AccountType
  /** Optional signed W-9 PDF file name (upload separate). */
  w9_file_name: string
  /** IRS W-9 certification checkbox */
  certified: boolean
  signer_name: string
  signer_title: string
  notes: string
}

export function emptyAddress(): VendorAddress {
  return { street: '', city: '', state: '', zip: '' }
}

export function emptyVendorPacketDraft(): VendorPacketDraft {
  return {
    vendor_kind: 'operator',
    legal_name: '',
    dba: '',
    tax_classification: '',
    llc_classification: '',
    other_classification: '',
    address: emptyAddress(),
    remit_different: false,
    remit_address: emptyAddress(),
    tin_type: 'ein',
    tin: '',
    ap_name: '',
    ap_email: '',
    ap_phone: '',
    bank_name: '',
    bank_routing: '',
    bank_account: '',
    account_type: 'checking',
    w9_file_name: '',
    certified: false,
    signer_name: '',
    signer_title: '',
    notes: '',
  }
}

export function taxClassificationLabel(c: TaxClassification): string {
  switch (c) {
    case 'individual':
      return 'Individual / sole proprietor'
    case 'c_corp':
      return 'C corporation'
    case 's_corp':
      return 'S corporation'
    case 'partnership':
      return 'Partnership'
    case 'trust_estate':
      return 'Trust / estate'
    case 'llc':
      return 'Limited liability company (LLC)'
    case 'other':
      return 'Other'
  }
}

/** Strip to digits for TIN / routing / account checks. */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

export function formatTinDisplay(tin: string, tinType: TinType): string {
  const d = digitsOnly(tin)
  if (tinType === 'ein' && d.length === 9) {
    return `${d.slice(0, 2)}-${d.slice(2)}`
  }
  if (tinType === 'ssn' && d.length === 9) {
    return `***-**-${d.slice(-4)}`
  }
  if (d.length >= 4) return `••••${d.slice(-4)}`
  return '••••'
}

export type VendorPacketValidation = {
  ok: boolean
  errors: string[]
  /** Soft gaps → NEEDS-INFO, submission still allowed when ok. */
  flags: string[]
}

export function validateVendorPacket(
  draft: VendorPacketDraft,
): VendorPacketValidation {
  const errors: string[] = []
  const flags: string[] = []

  if (!draft.legal_name.trim()) errors.push('Legal name is required')
  if (!draft.tax_classification) {
    errors.push('Federal tax classification is required')
  }
  if (draft.tax_classification === 'llc' && !draft.llc_classification) {
    errors.push('LLC tax classification is required')
  }
  if (
    draft.tax_classification === 'other' &&
    !draft.other_classification.trim()
  ) {
    errors.push('Describe the “other” tax classification')
  }

  const addr = draft.address
  if (!addr.street.trim() || !addr.city.trim() || !addr.state.trim() || !addr.zip.trim()) {
    errors.push('Address (street, city, state, ZIP) is required')
  }

  if (draft.remit_different) {
    const r = draft.remit_address
    if (!r.street.trim() || !r.city.trim() || !r.state.trim() || !r.zip.trim()) {
      errors.push('Remit-to address is incomplete')
    }
  }

  const tin = digitsOnly(draft.tin)
  if (tin.length !== 9) {
    errors.push(
      draft.tin_type === 'ein'
        ? 'EIN must be 9 digits'
        : 'SSN must be 9 digits',
    )
  }

  if (!draft.ap_email.trim() || !draft.ap_email.includes('@')) {
    errors.push('AP / billing email is required')
  }
  if (!draft.ap_phone.trim()) flags.push('ap_phone')

  const routing = digitsOnly(draft.bank_routing)
  const account = digitsOnly(draft.bank_account)
  if (routing.length !== 9) errors.push('Bank routing number must be 9 digits')
  if (account.length < 4) errors.push('Bank account number is required')
  if (!draft.bank_name.trim()) flags.push('bank_name')

  if (!draft.certified) {
    errors.push('W-9 certification must be checked')
  }
  if (!draft.signer_name.trim()) errors.push('Signer name is required')

  if (!draft.w9_file_name.trim()) flags.push('w9_file')

  return { ok: errors.length === 0, errors, flags }
}
