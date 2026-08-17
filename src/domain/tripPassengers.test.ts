import { describe, expect, it } from 'vitest'
import {
  composePassengerName,
  emptyTripPassenger,
  normalizeTripPassengers,
  normalizeTripPortalCargoDetails,
  splitFullName,
  tripPassengerFilled,
  tripPassengerNames,
} from './tripPassengers'

describe('tripPassengers', () => {
  it('normalizes first/last and legacy full name', () => {
    const rows = normalizeTripPassengers([
      { first_name: ' Ada ', last_name: ' Lovelace ', weight_lbs: '180', dob: '1990-01-02' },
      { name: 'Grace Hopper', weight_lbs: '', dob: '' },
      { name: '  ', weight_lbs: '', dob: '' },
    ])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      first_name: 'Ada',
      last_name: 'Lovelace',
      name: 'Ada Lovelace',
      weight_lbs: 180,
      dob: '1990-01-02',
    })
    expect(rows[1]).toMatchObject({
      first_name: 'Grace',
      last_name: 'Hopper',
      name: 'Grace Hopper',
    })
    expect(tripPassengerNames(rows)).toEqual(['Ada Lovelace', 'Grace Hopper'])
    expect(tripPassengerFilled(rows[0]!)).toBe(true)
    expect(tripPassengerFilled(rows[2]!)).toBe(false)
  })

  it('emptyTripPassenger seeds an editable row', () => {
    const p = emptyTripPassenger({ first_name: 'Grace', last_name: 'Hopper' })
    expect(p.id).toBeTruthy()
    expect(p.name).toBe('Grace Hopper')
    expect(p.weight_lbs).toBe('')
  })

  it('compose / split helpers round-trip', () => {
    expect(composePassengerName('Ada', 'Lovelace')).toBe('Ada Lovelace')
    expect(splitFullName('Ada Lovelace')).toEqual({
      first: 'Ada',
      last: 'Lovelace',
    })
  })

  it('normalizes portal cargo details', () => {
    expect(
      normalizeTripPortalCargoDetails({
        dims: ' 48x40x36 ',
        total_weight_lbs: '420',
      }),
    ).toEqual({ dims: '48x40x36', total_weight_lbs: 420 })
    expect(normalizeTripPortalCargoDetails({})).toBeNull()
  })
})
