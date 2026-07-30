import { describe, expect, it } from 'vitest'
import {
  emptyTripPassenger,
  normalizeTripPassengers,
  tripPassengerFilled,
  tripPassengerNames,
} from './tripPassengers'

describe('tripPassengers', () => {
  it('normalizes sparse rows and drops blank names from name list', () => {
    const rows = normalizeTripPassengers([
      { name: ' Ada ', weight_lbs: '180', dob: '1990-01-02' },
      { name: '  ', weight_lbs: '', dob: '' },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      name: 'Ada',
      weight_lbs: 180,
      dob: '1990-01-02',
    })
    expect(tripPassengerNames(rows)).toEqual(['Ada'])
    expect(tripPassengerFilled(rows[0]!)).toBe(true)
    expect(tripPassengerFilled(rows[1]!)).toBe(false)
  })

  it('emptyTripPassenger seeds an editable row', () => {
    const p = emptyTripPassenger({ name: 'Grace' })
    expect(p.id).toBeTruthy()
    expect(p.name).toBe('Grace')
    expect(p.weight_lbs).toBe('')
  })
})
