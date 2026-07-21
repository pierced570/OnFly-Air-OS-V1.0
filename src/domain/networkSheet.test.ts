import { describe, expect, it } from 'vitest'
import { buildNetworkSheetRows } from './networkSheet'
import type { AircraftRow, OperatorRow } from '@/lib/types'

const op: OperatorRow = {
  id: 'op1',
  name: 'Test Air',
  base_icao: 'KCLE',
  needs_info: [],
  aircraft_count: 1,
  contact_cell: null,
  contact_email: null,
}

const ac: AircraftRow = {
  id: 'ac1',
  operator_id: 'op1',
  operator_name: 'Test Air',
  tail: 'N123AB',
  type_name: 'Lear 45',
  category: 'Light Jet',
  engines: 'Turbine',
  base_icao: 'KCLE',
  cruise_kts: 445,
  mtow_lbs: 21500,
  max_payload_lbs: 2500,
  seats: 8,
  fet_applies: true,
  needs_info: [],
  active: true,
}

describe('buildNetworkSheetRows', () => {
  it('fills door dims from type_specs and flags them', () => {
    const rows = buildNetworkSheetRows({
      operators: [op],
      aircraft: [ac],
      type_specs: [
        {
          type_name: 'Lear 45',
          door_w_in: 24,
          door_h_in: 48,
          door_type: 'Airstair',
        },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].door_w_in).toBe(24)
    expect(rows[0].door_h_in).toBe(48)
    expect(rows[0].door_from_type_spec).toBe(true)
  })

  it('prefers aircraft patch over type_spec', () => {
    const rows = buildNetworkSheetRows({
      operators: [op],
      aircraft: [ac],
      type_specs: [{ type_name: 'Lear 45', door_w_in: 24, door_h_in: 48 }],
      aircraftPatches: { ac1: { door_w_in: 52, door_h_in: 60 } },
      operatorPatches: { op1: { contact_cell: '+15551212', contact_name: 'Sam' } },
    })
    expect(rows[0].door_w_in).toBe(52)
    expect(rows[0].door_from_type_spec).toBe(false)
    expect(rows[0].contact_cell).toBe('+15551212')
    expect(rows[0].contact_name).toBe('Sam')
  })

  it('applies editable operator name, tail, type, and category patches', () => {
    const rows = buildNetworkSheetRows({
      operators: [op],
      aircraft: [ac],
      type_specs: [],
      aircraftPatches: {
        ac1: {
          tail: 'n999zz',
          type_name: 'King Air 200',
          category: 'Turboprop',
        },
      },
      operatorPatches: { op1: { name: 'Renamed Air' } },
    })
    expect(rows[0].operator_name).toBe('Renamed Air')
    expect(rows[0].tail).toBe('N999ZZ')
    expect(rows[0].type_name).toBe('King Air 200')
    expect(rows[0].category).toBe('Turboprop')
  })
})
