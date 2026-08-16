/**
 * Client Rules Guide — desk-facing summary of standing trip constraints.
 * Pure TypeScript.
 */

import {
  hardFiltersFromPolicy,
  normalizeMissionPolicy,
  type MissionAircraftPolicy,
} from './clientOnboard'

export type ClientRulesGuideChip = {
  id: string
  label: string
  /** attention = gold, hard = late/red, ok = on-plan */
  tone: 'attention' | 'hard' | 'ok'
}

export type ClientRulesSlice = {
  dual_pilot_required: boolean
  freight_only: boolean
  multi_engine_only: boolean
  single_engine_turboprop_only: boolean
  no_single_engine_night: boolean
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  exceptions_with_permission: boolean
  other_rules: string[]
}

export type ClientRulesGuideInput = {
  notes: string
  rules: ClientRulesSlice
  profile: {
    freight_policy?: MissionAircraftPolicy
    passenger_policy?: MissionAircraftPolicy
    shipping_flags?: {
      hazmat_sometimes?: boolean
      temp_control?: boolean
      oversized?: boolean
      high_declared_value?: boolean
    }
  }
}

export type ClientRulesGuideSummary = {
  chips: ClientRulesGuideChip[]
  freight: MissionAircraftPolicy
  passenger: MissionAircraftPolicy
  hasPassengerRules: boolean
  standingNotes: string[]
}

function policyFromRules(rules: ClientRulesSlice): MissionAircraftPolicy {
  return normalizeMissionPolicy({
    no_single_engine: rules.multi_engine_only,
    no_single_engine_pistons: rules.single_engine_turboprop_only,
    dual_pilot_required: rules.dual_pilot_required,
    other_restriction: false,
    other_notes: '',
  })
}

/** Apply freight policy hard filters onto flattened client_rules. */
export function applyFreightPolicyToRules(
  rules: ClientRulesSlice,
  policy: MissionAircraftPolicy,
  exceptionsOk: boolean,
): ClientRulesSlice {
  const hard = hardFiltersFromPolicy(policy)
  const other = [...rules.other_rules]
  const notes = policy.other_notes.trim()
  if (policy.other_restriction && notes) {
    const tag = `Freight: ${notes}`
    if (!other.some((o) => o === tag)) other.push(tag)
  }
  return {
    ...rules,
    dual_pilot_required: hard.dual_pilot_required,
    multi_engine_only: hard.multi_engine_only,
    single_engine_turboprop_only: hard.single_engine_turboprop_only,
    exceptions_with_permission: exceptionsOk,
    other_rules: other,
  }
}

export function summarizeClientRulesGuide(
  client: ClientRulesGuideInput,
): ClientRulesGuideSummary {
  const freight = normalizeMissionPolicy(
    client.profile.freight_policy ?? policyFromRules(client.rules),
  )
  const passenger = normalizeMissionPolicy(client.profile.passenger_policy)
  const hasPassengerRules =
    Boolean(client.profile.passenger_policy) ||
    passenger.dual_pilot_required ||
    passenger.no_single_engine ||
    passenger.no_single_engine_pistons ||
    passenger.other_restriction

  const chips: ClientRulesGuideChip[] = []
  if (client.rules.freight_only) {
    chips.push({ id: 'freight_only', label: 'Freight only', tone: 'hard' })
  }
  if (freight.no_single_engine || client.rules.multi_engine_only) {
    chips.push({ id: 'multi', label: 'Multi-engine only', tone: 'hard' })
  } else if (
    freight.no_single_engine_pistons ||
    client.rules.single_engine_turboprop_only
  ) {
    chips.push({
      id: 'se_turbo',
      label: 'SE turboprop OK (no SE pistons)',
      tone: 'attention',
    })
  }
  if (freight.dual_pilot_required || client.rules.dual_pilot_required) {
    chips.push({ id: 'dual', label: 'Dual pilot', tone: 'hard' })
  }
  if (hasPassengerRules) {
    if (passenger.dual_pilot_required) {
      chips.push({ id: 'pax_dual', label: 'Pax: dual pilot', tone: 'hard' })
    }
    if (passenger.no_single_engine) {
      chips.push({ id: 'pax_multi', label: 'Pax: multi-engine', tone: 'hard' })
    }
  }
  if (!client.rules.hazmat_allowed) {
    chips.push({ id: 'no_haz', label: 'No hazmat', tone: 'hard' })
  } else if (client.profile.shipping_flags?.hazmat_sometimes) {
    chips.push({ id: 'haz_some', label: 'Hazmat sometimes', tone: 'attention' })
  }
  if (client.rules.exceptions_with_permission) {
    chips.push({
      id: 'exc',
      label: 'Exceptions w/ permission',
      tone: 'attention',
    })
  }
  if (client.rules.declared_value_norm.trim()) {
    chips.push({
      id: 'dv',
      label: `Declared value: ${client.rules.declared_value_norm}`,
      tone: 'attention',
    })
  }
  if (!chips.length) {
    chips.push({ id: 'open', label: 'No hard aircraft filters', tone: 'ok' })
  }

  const standingNotes = [
    ...client.rules.other_rules.map((s) => s.trim()).filter(Boolean),
    ...(client.rules.hazmat_notes.trim()
      ? [`Hazmat: ${client.rules.hazmat_notes.trim()}`]
      : []),
    ...(client.notes.trim() ? [client.notes.trim()] : []),
  ]

  return {
    chips,
    freight,
    passenger,
    hasPassengerRules,
    standingNotes: [...new Set(standingNotes)],
  }
}
