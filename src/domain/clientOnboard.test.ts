import { describe, expect, it } from 'vitest'
import {
  emptyClientOnboardDraft,
  emptyMissionAircraftPolicy,
  hardFiltersFromPolicy,
  laneCityHints,
  normalizeMissionPolicy,
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

  it('maps freight restrictions to hard filters + chips', () => {
    const d = emptyClientOnboardDraft()
    d.freight_policy = {
      ...emptyMissionAircraftPolicy(),
      no_single_engine: true,
      dual_pilot_required: true,
    }
    d.passenger_policy = {
      ...emptyMissionAircraftPolicy(),
      no_single_engine_pistons: true,
    }
    d.moves_passengers = true
    d.exceptions_ok = true
    d.declared_value_norm = 'under $50k'
    d.freight_policy = {
      ...d.freight_policy,
      other_restriction: true,
      other_notes: 'No gravel strips',
    }
    d.po_assigned_by = 'client'
    const rules = rulesFromOnboardDraft(d)
    expect(rules.dual_pilot_required).toBe(true)
    expect(rules.multi_engine_only).toBe(true)
    expect(rules.single_engine_turboprop_only).toBe(false)
    expect(rules.freight_only).toBe(false)
    expect(rules.hazmat_allowed).toBe(true)
    expect(rules.exceptions_with_permission).toBe(true)
    expect(rules.declared_value_norm).toBe('under $50k')
    expect(rules.other_rules).toContain('Freight: no single-engine')
    expect(rules.other_rules).toContain('Freight: dual pilot required')
    expect(rules.other_rules).toContain('Freight: No gravel strips')
    expect(rules.other_rules).toContain(
      'Passenger: no single-engine pistons (SE turboprop OK)',
    )
    expect(rules.other_rules).toContain('Exceptions OK with confirmation')
    expect(payTermsLabel('net_60')).toBe('Net 60')
  })

  it('maps no SE pistons → single_engine_turboprop_only', () => {
    const d = emptyClientOnboardDraft()
    d.freight_policy = {
      ...emptyMissionAircraftPolicy(),
      no_single_engine_pistons: true,
    }
    const rules = rulesFromOnboardDraft(d)
    expect(rules.single_engine_turboprop_only).toBe(true)
    expect(hardFiltersFromPolicy(d.freight_policy).single_engine_turboprop_only).toBe(
      true,
    )
  })

  it('defaults to freight_only when passengers = No', () => {
    const d = emptyClientOnboardDraft()
    expect(d.moves_passengers).toBe(false)
    d.passenger_policy = {
      ...emptyMissionAircraftPolicy(),
      dual_pilot_required: true,
    }
    const rules = rulesFromOnboardDraft(d)
    expect(rules.freight_only).toBe(true)
    expect(rules.other_rules.some((c) => c.startsWith('Passenger:'))).toBe(
      false,
    )
  })

  it('nothing checked → no hard filter constraints', () => {
    const rules = rulesFromOnboardDraft(emptyClientOnboardDraft())
    expect(rules.dual_pilot_required).toBe(false)
    expect(rules.multi_engine_only).toBe(false)
    expect(rules.single_engine_turboprop_only).toBe(false)
    expect(rules.exceptions_with_permission).toBe(false)
  })

  it('normalizes legacy opt-in policy shapes', () => {
    const legacy = normalizeMissionPolicy({
      dual_pilot_only: true,
      multi_engine_only: true,
      single_engine_ok: false,
      single_engine_turboprop_ok: false,
      exceptions_with_permission: true,
    })
    expect(legacy.no_single_engine).toBe(true)
    expect(legacy.dual_pilot_required).toBe(true)
    expect(legacy.no_single_engine_pistons).toBe(false)
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
