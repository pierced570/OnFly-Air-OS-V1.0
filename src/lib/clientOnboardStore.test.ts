import { describe, expect, it } from 'vitest'
import { emptyClientOnboardDraft } from '@/domain/clientOnboard'
import { getClient } from '@/lib/clientStore'
import { listOpenNeedsInfo } from '@/lib/needsInfoStore'
import { submitClientOnboard } from './clientOnboardStore'

describe('submitClientOnboard', () => {
  it('creates client with ops/AP contacts, rules, and portal profile', async () => {
    const d = emptyClientOnboardDraft()
    d.legal_name = 'Portal Test Air'
    d.address = {
      street: '1 Ramp Rd',
      city: 'Akron',
      state: 'OH',
      zip: '44306',
    }
    d.ops = {
      name: 'Ops Lead',
      email: 'ops-portal-test@example.com',
      phone: '330-555-0199',
    }
    d.ap_same_as_ops = true
    d.front_desk_phone = '330-555-0199'
    d.emergency_same_as_ops = true
    d.no_frequent_lanes = false
    d.lanes = [
      {
        origin: 'KCAK',
        destination: 'KMDW',
        origin_city: 'Akron, OH',
        destination_city: 'Chicago, IL',
      },
    ]
    d.po_assigned_by = 'client'
    d.po_prefix = 'PSA'
    d.freight_policy = {
      dual_pilot_only: true,
      multi_engine_only: false,
      single_engine_ok: false,
      single_engine_turboprop_ok: false,
      exceptions_with_permission: false,
    }
    d.freight_only = true
    d.hazmat_allowed = true
    d.hazmat_notes = 'Sometimes'
    d.declared_value_norm = 'under $100k'
    d.pay_terms = 'net_15'

    const { client, taskIds } = await submitClientOnboard(d)
    expect(client.name).toBe('Portal Test Air')
    expect(client.invoice_email).toBe('ops-portal-test@example.com')
    expect(client.pay_terms).toBe('Net 15')
    expect(client.po_prefix).toBe('PSA')
    expect(client.contacts.some((c) => c.role === 'requester')).toBe(true)
    expect(client.contacts.some((c) => c.role === 'ap')).toBe(true)
    expect(client.rules.dual_pilot_required).toBe(true)
    expect(client.rules.freight_only).toBe(true)
    expect(client.rules.declared_value_norm).toBe('under $100k')
    expect(client.profile.frequent_lanes?.[0]?.origin).toBe('KCAK')
    expect(client.profile.requires_po).toBe(true)
    expect(client.profile.po_assigned_by).toBe('client')
    expect(client.profile.freight_policy?.dual_pilot_only).toBe(true)
    expect(client.profile.address?.city).toBe('Akron')
    expect(getClient(client.id)?.id).toBe(client.id)
    expect(taskIds.length).toBeGreaterThan(0)
    expect(
      listOpenNeedsInfo().some(
        (t) => t.entity_id === client.id && t.field === 'onboard_review',
      ),
    ).toBe(true)
  })
})
