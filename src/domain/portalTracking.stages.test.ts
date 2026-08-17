import { describe, expect, it } from 'vitest'
import {
  clientOpsStageLabel,
  type OpsForecastRow,
} from '@/domain/portalTracking'

function row(key: OpsForecastRow['key']): OpsForecastRow {
  return {
    key,
    label: key,
    estimatedLocal: '12:00 PM',
    estimatedZulu: '16:00 Z',
    actualOrForecastLocal: '12:15 PM',
    deltaMin: 15,
    status: 'pending',
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
  })
})
