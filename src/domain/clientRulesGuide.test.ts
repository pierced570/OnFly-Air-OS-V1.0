import { describe, expect, it } from 'vitest'
import {
  applyFreightPolicyToRules,
  summarizeClientRulesGuide,
} from './clientRulesGuide'
import { emptyMissionAircraftPolicy } from './clientOnboard'

describe('clientRulesGuide', () => {
  it('summarizes Piedmont-style dual pilot + multi-engine', () => {
    const s = summarizeClientRulesGuide({
      notes:
        'ALL PASSENGER TRIPS REQUIRE 2 PILOTS AND 2 ENGINES - NO EXCEPTIONS.',
      rules: {
        dual_pilot_required: true,
        freight_only: false,
        multi_engine_only: true,
        single_engine_turboprop_only: false,
        no_single_engine_night: false,
        hazmat_allowed: true,
        hazmat_notes: '',
        declared_value_norm: '',
        exceptions_with_permission: false,
        other_rules: [],
      },
      profile: {
        passenger_policy: {
          no_single_engine: true,
          no_single_engine_pistons: true,
          dual_pilot_required: true,
          other_restriction: false,
          other_notes: '',
        },
      },
    })
    expect(s.chips.some((c) => c.id === 'dual')).toBe(true)
    expect(s.chips.some((c) => c.id === 'multi')).toBe(true)
    expect(s.chips.some((c) => c.id === 'pax_dual')).toBe(true)
    expect(s.standingNotes[0]).toMatch(/2 PILOTS/)
  })

  it('applies freight policy onto flattened rules', () => {
    const policy = {
      ...emptyMissionAircraftPolicy(),
      no_single_engine: true,
      dual_pilot_required: true,
    }
    const next = applyFreightPolicyToRules(
      {
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
      policy,
      true,
    )
    expect(next.multi_engine_only).toBe(true)
    expect(next.dual_pilot_required).toBe(true)
    expect(next.exceptions_with_permission).toBe(true)
  })
})
