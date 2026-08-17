import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetClientsForTests,
  getClient,
  replaceClientsFromDb,
  sameClientId,
  type ClientProfile,
} from '@/lib/clientStore'

function blankClient(
  partial: Partial<ClientProfile> & { id: string; name: string },
): ClientProfile {
  return {
    email: '',
    invoice_email: '',
    contacts: [],
    last_po: null,
    po_prefix: null,
    pay_terms: 'Net 30',
    notes: '',
    rules: {
      dual_pilot_required: false,
      freight_only: false,
      multi_engine_only: false,
      single_engine_turboprop_only: false,
      no_single_engine_night: false,
      hazmat_allowed: true,
      hazmat_notes: '',
      declared_value_norm: '',
      exceptions_with_permission: false,
      other_rules: [],
    },
    qb_customer_id: null,
    profile: {},
    ...partial,
  }
}

describe('getClient id alias', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('resolves Supabase UUID when directory is keyed by legacy_key', () => {
    const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    replaceClientsFromDb([
      blankClient({
        id: 'client-tester',
        supabase_id: uuid,
        name: 'Tester',
      }),
    ])
    expect(getClient('client-tester')?.name).toBe('Tester')
    expect(getClient(uuid)?.name).toBe('Tester')
  })

  it('sameClientId matches legacy_key and supabase UUID', () => {
    const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    replaceClientsFromDb([
      blankClient({
        id: 'client-tester',
        supabase_id: uuid,
        name: 'Tester',
      }),
    ])
    expect(sameClientId('client-tester', uuid)).toBe(true)
    expect(sameClientId('client-tester', 'other')).toBe(false)
  })
})
