import { describe, expect, it } from 'vitest'
import {
  emptyClientOnboardDraft,
  emptyMissionAircraftPolicy,
  hardFiltersFromPolicy,
  laneCityHints,
  payTermsLabel,
  rulesFromOnboardDraft,
  validateClientOnboard,
} from './clientOnboard'

describe('validateClientOnboard', () => {
  it('requires core fields', () => {
    const issues = validateClientOnboard(emptyClientOnboardDraft())
    expect(issues.map((i) => i.field)).toEqual(
      expect.arrayContaining([
        'legal_name',
        'address',
        'ops',
        'ap',
        'front_desk_phone',
        'emergency',
        'lanes',
      ]),
    )
  })

  it('passes a minimal complete draft', () => {
    const d = emptyClientOnboardDraft()
    d.legal_name = 'Acme Air Parts'
    d.address = {
      street: '100 Hangar Way',
      city: 'Akron',
      state: 'OH',
      zip: '44306',
    }
    d.ops = {
      name: 'Ops Desk',
      email: 'ops@acme.example',
      phone: '330-555-0100',
    }
    d.ap_same_as_ops = true
    d.front_desk_phone = '330-555-0100'
    d.emergency_same_as_ops = true
    d.no_frequent_lanes = true
    expect(validateClientOnboard(d)).toEqual([])
  })

  it('requires billing address when different', () => {
    const d = emptyClientOnboardDraft()
    d.legal_name = 'Acme'
    d.address = {
      street: '1 Main',
      city: 'Akron',
      state: 'OH',
      zip: '44306',
    }
    d.billing_same_as_address = false
    d.ops = { name: 'Ops', email: 'ops@x.com', phone: '1' }
    d.ap_same_as_ops = true
    d.front_desk_phone = '1'
    d.emergency_same_as_ops = true
    d.no_frequent_lanes = true
    expect(validateClientOnboard(d).map((i) => i.field)).toContain(
      'billing_address',
    )
  })

  it('maps freight policy to hard filters + chips', () => {
    const d = emptyClientOnboardDraft()
    d.freight_policy = {
      ...emptyMissionAircraftPolicy(),
      dual_pilot_only: true,
      multi_engine_only: true,
      exceptions_with_permission: true,
    }
    d.passenger_policy = {
      ...emptyMissionAircraftPolicy(),
      single_engine_ok: true,
    }
    d.freight_only = false
    d.hazmat_allowed = false
    d.declared_value_norm = 'under $50k'
    d.aircraft_other_notes = 'No gravel strips'
    d.po_assigned_by = 'client'
    const rules = rulesFromOnboardDraft(d)
    expect(rules.dual_pilot_required).toBe(true)
    expect(rules.multi_engine_only).toBe(true)
    expect(rules.single_engine_turboprop_only).toBe(false)
    expect(rules.hazmat_allowed).toBe(false)
    expect(rules.declared_value_norm).toBe('under $50k')
    expect(rules.other_rules).toContain('Freight: dual pilot only')
    expect(rules.other_rules).toContain('Freight: multi-engine only')
    expect(rules.other_rules).toContain('Freight: exceptions with permission')
    expect(rules.other_rules).toContain('Passenger: single-engine OK')
    expect(rules.other_rules).toContain('No gravel strips')
    expect(payTermsLabel('net_60')).toBe('Net 60')
  })

  it('maps SE turboprop-only when freight allows turboprop but not all SE', () => {
    const d = emptyClientOnboardDraft()
    d.freight_policy = {
      ...emptyMissionAircraftPolicy(),
      single_engine_turboprop_ok: true,
      single_engine_ok: false,
    }
    const rules = rulesFromOnboardDraft(d)
    expect(rules.single_engine_turboprop_only).toBe(true)
    expect(hardFiltersFromPolicy(d.freight_policy).single_engine_turboprop_only).toBe(
      true,
    )
  })

  it('skips passenger chips when freight_only', () => {
    const d = emptyClientOnboardDraft()
    d.freight_only = true
    d.passenger_policy = {
      ...emptyMissionAircraftPolicy(),
      dual_pilot_only: true,
    }
    const rules = rulesFromOnboardDraft(d)
    expect(rules.freight_only).toBe(true)
    expect(rules.other_rules.some((c) => c.startsWith('Passenger:'))).toBe(
      false,
    )
  })

  it('hardFiltersFromPolicy maps passenger dual/multi', () => {
    const hard = hardFiltersFromPolicy({
      ...emptyMissionAircraftPolicy(),
      dual_pilot_only: true,
      multi_engine_only: true,
    })
    expect(hard.dual_pilot_required).toBe(true)
    expect(hard.multi_engine_only).toBe(true)
    expect(hard.single_engine_turboprop_only).toBe(false)
  })

  it('extracts city hints from lanes', () => {
    expect(
      laneCityHints([
        {
          origin: 'KCAK',
          destination: 'KMDW',
          origin_city: 'Akron, OH',
          destination_city: 'Chicago, IL',
        },
      ]),
    ).toEqual(
      expect.arrayContaining(['Akron, OH', 'Chicago, IL', 'KCAK', 'KMDW']),
    )
  })
})
