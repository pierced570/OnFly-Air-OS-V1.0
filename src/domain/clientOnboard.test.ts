import { describe, expect, it } from 'vitest'
import {
  emptyClientOnboardDraft,
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

  it('maps rules like Admin ClientWizard', () => {
    const d = emptyClientOnboardDraft()
    d.dual_pilot_required = true
    d.freight_only = true
    d.multi_engine_only = true
    d.single_engine_turboprop_only = false
    d.no_single_engine_night = true
    d.turboprop_preferred = true
    d.jet_ok = true
    d.aircraft_other_notes = 'No gravel strips'
    d.hazmat_allowed = false
    d.declared_value_norm = 'under $50k'
    d.po_assigned_by = 'client'
    const rules = rulesFromOnboardDraft(d)
    expect(rules.dual_pilot_required).toBe(true)
    expect(rules.freight_only).toBe(true)
    expect(rules.single_engine_turboprop_only).toBe(false)
    expect(rules.hazmat_allowed).toBe(false)
    expect(rules.declared_value_norm).toBe('under $50k')
    expect(rules.other_rules).toContain('PO assigned by client')
    expect(rules.other_rules).toContain('Turboprop preferred')
    expect(rules.other_rules).toContain('Jet OK')
    expect(rules.other_rules).toContain('No gravel strips')
    expect(payTermsLabel('net_60')).toBe('Net 60')
  })

  it('maps vendor-number + OnFly PO assignment', () => {
    const d = emptyClientOnboardDraft()
    d.po_assigned_by = 'onfly'
    d.needs_vendor_number = true
    const rules = rulesFromOnboardDraft(d)
    expect(rules.other_rules).toContain('PO assigned by OnFly')
    expect(rules.other_rules).toContain('Needs vendor number in client AP system')
  })

  it('maps single-engine turboprop-only hard rule', () => {
    const d = emptyClientOnboardDraft()
    d.single_engine_turboprop_only = true
    d.single_engine_piston_ok = true
    const rules = rulesFromOnboardDraft(d)
    expect(rules.single_engine_turboprop_only).toBe(true)
    expect(rules.other_rules).toContain('Single-engine piston OK')
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
