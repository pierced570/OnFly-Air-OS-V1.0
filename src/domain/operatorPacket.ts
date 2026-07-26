/**
 * Operator network packet — invite upload (docs, contact pref, banking).
 * Pure TypeScript.
 */

import type { QuoteLinkChannel } from '@/domain/quoteLinkChannel'

/** How the operator wants to be reached for trip offers / quotes. */
export type QuoteContactPref = 'call' | 'text' | 'email'

export const QUOTE_CONTACT_PREFS: {
  id: QuoteContactPref
  label: string
}[] = [
  { id: 'text', label: 'Text' },
  { id: 'email', label: 'Email' },
  { id: 'call', label: 'Call' },
]

/** Map quote preference → how we deliver offer links (call still needs a digital path). */
export function quotePrefToLinkChannel(
  pref: QuoteContactPref,
): QuoteLinkChannel {
  if (pref === 'text') return 'sms'
  if (pref === 'email') return 'email'
  return 'both'
}

export type OperatorBanking = {
  ach_routing: string
  ach_account: string
  ach_account_type: 'checking' | 'savings' | ''
  wire_bank_name: string
  wire_beneficiary: string
  wire_routing: string
  wire_account: string
  wire_swift: string
}

export function emptyOperatorBanking(): OperatorBanking {
  return {
    ach_routing: '',
    ach_account: '',
    ach_account_type: 'checking',
    wire_bank_name: '',
    wire_beneficiary: '',
    wire_routing: '',
    wire_account: '',
    wire_swift: '',
  }
}

export function validateOperatorPacket(input: {
  company_name: string
  email: string
  cell: string
  quote_pref: QuoteContactPref
}): string | null {
  if (!input.company_name.trim()) return 'Company name is required'
  if (!input.email.trim().includes('@')) return 'Valid email is required'
  if (input.quote_pref === 'text' && !input.cell.trim()) {
    return 'Cell number required for text preference'
  }
  if (input.quote_pref === 'call' && !input.cell.trim()) {
    return 'Phone number required for call preference'
  }
  return null
}

export function packetCompleteness(input: {
  has_charter: boolean
  has_d085: boolean
  has_coi: boolean
  has_email: boolean
  has_cell: boolean
  has_ach: boolean
  has_wire: boolean
  tail_count: number
}): number {
  let score = 20
  if (input.has_email) score += 10
  if (input.has_cell) score += 10
  if (input.has_charter) score += 15
  if (input.has_d085) score += 15
  if (input.has_coi) score += 15
  if (input.tail_count > 0) score += 10
  if (input.has_ach) score += 5
  if (input.has_wire) score += 5
  return Math.min(100, score)
}
