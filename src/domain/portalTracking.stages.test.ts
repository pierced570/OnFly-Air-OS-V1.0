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
  it('maps ops keys to progress-only stage names (no clocks)', () => {
    expect(clientOpsStageLabel(row('arrived_origin'))).toBe('At pickup')
    expect(clientOpsStageLabel(row('takeoff'))).toBe('Wheels up')
    expect(clientOpsStageLabel(row('time_in_air'))).toBe('En route')
    expect(clientOpsStageLabel(row('on_ground_dest'))).toBe('Delivered')
  })
})
