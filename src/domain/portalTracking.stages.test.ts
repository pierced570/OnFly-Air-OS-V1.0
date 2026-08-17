import { describe, expect, it } from 'vitest'
import {
  applyPortalStageOverride,
  clientOpsStageLabel,
  type OpsForecastRow,
  type PortalOpsStageKey,
} from '@/domain/portalTracking'

function row(
  key: PortalOpsStageKey,
  status: OpsForecastRow['status'] = 'pending',
): OpsForecastRow {
  return {
    key,
    label: key,
    estimatedLocal: '12:00 PM',
    estimatedZulu: '16:00 Z',
    actualOrForecastLocal: '12:15 PM',
    deltaMin: 15,
    status,
    isForecast: true,
    kind: 'arrival',
  }
}

describe('clientOpsStageLabel', () => {
  it('maps ops keys to FlightAware-style trip stages (no clocks)', () => {
    expect(clientOpsStageLabel(row('enroute_pickup'))).toBe('Enroute to pickup')
    expect(clientOpsStageLabel(row('at_pickup'))).toBe('At Pickup airport')
    expect(clientOpsStageLabel(row('enroute_dest'))).toBe(
      'Enroute to destination',
    )
    expect(clientOpsStageLabel(row('landed_dest'))).toBe(
      'Landed at destination',
    )
    expect(
      clientOpsStageLabel({
        ...row('landed_dest', 'done'),
        label: 'Delivered',
      }),
    ).toBe('Delivered')
  })
})

describe('applyPortalStageOverride', () => {
  const base = [
    row('enroute_pickup', 'done'),
    row('at_pickup', 'active'),
    row('enroute_dest', 'pending'),
    row('landed_dest', 'pending'),
  ]

  it('pins the selected stage as active and marks prior done', () => {
    const next = applyPortalStageOverride(base, 'enroute_dest')
    expect(next.map((r) => r.status)).toEqual([
      'done',
      'done',
      'active',
      'pending',
    ])
  })

  it('leaves rows unchanged when override is null', () => {
    expect(applyPortalStageOverride(base, null)).toEqual(base)
  })
})
