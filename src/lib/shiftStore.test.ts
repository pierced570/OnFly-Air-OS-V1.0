import { afterEach, describe, expect, it } from 'vitest'
import {
  endShift,
  getOnShift,
  listOnShift,
  startShift,
} from './shiftStore'
import {
  clearPresence,
  listLoggedIn,
  touchPresence,
} from './presenceStore'

describe('shiftStore multi-dispatcher', () => {
  afterEach(() => {
    endShift()
  })

  it('keeps multiple people on shift', () => {
    startShift('Pierce', '+16105092031')
    startShift('Paige', '+15555550111')
    expect(listOnShift().map((s) => s.person_name)).toEqual([
      'Paige',
      'Pierce',
    ])
    expect(getOnShift()?.person_name).toBe('Paige')
  })

  it('refreshing the same person does not duplicate', () => {
    startShift('Pierce', '+16105092031')
    startShift('Pierce', '+16105092099')
    expect(listOnShift()).toHaveLength(1)
    expect(getOnShift()?.phone).toBe('+16105092099')
  })
})

describe('presenceStore', () => {
  afterEach(() => {
    for (const p of listLoggedIn()) clearPresence(p.staff_id)
  })

  it('lists touched staff as logged in', () => {
    touchPresence({
      staff_id: 'staff-pierce',
      name: 'Pierce Demetriades',
      phone: '6105092031',
    })
    touchPresence({
      staff_id: 'staff-paige',
      name: 'Paige Miller',
      phone: '',
    })
    expect(listLoggedIn().map((p) => p.name)).toEqual([
      'Pierce Demetriades',
      'Paige Miller',
    ])
  })
})
