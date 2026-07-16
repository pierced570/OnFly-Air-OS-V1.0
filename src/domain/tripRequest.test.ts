import { describe, expect, it } from 'vitest'
import {
  ASAP_MAX_HOURS,
  emptyTripRequestDraft,
  isAsapReady,
  validateTripRequest,
} from './tripRequest'

describe('tripRequest', () => {
  it('ASAP window is under 4 hours', () => {
    const now = new Date('2026-07-16T12:00:00Z')
    expect(isAsapReady(new Date('2026-07-16T15:00:00Z'), now)).toBe(true)
    expect(isAsapReady(new Date('2026-07-16T16:00:00Z'), now)).toBe(false)
    expect(ASAP_MAX_HOURS).toBe(4)
  })

  it('requires email + ICAOs on portal draft', () => {
    const d = emptyTripRequestDraft()
    const issues = validateTripRequest(d, { requireEmail: true })
    expect(issues.some((i) => i.field === 'email')).toBe(true)
    expect(issues.some((i) => i.field === 'leg.0.origin')).toBe(true)
  })

  it('round trip requires hours on ground', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.direction = 'round_trip'
    d.hours_on_ground = ''
    expect(
      validateTripRequest(d).some((i) => i.field === 'hours_on_ground'),
    ).toBe(true)
  })

  it('passenger mode requires name weight dob', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.cargo_only = false
    d.pax = [{ name: '', weight_lbs: '', dob: '' }]
    const issues = validateTripRequest(d)
    expect(issues.some((i) => i.field === 'pax.0.name')).toBe(true)
    expect(issues.some((i) => i.field === 'pax.0.weight')).toBe(true)
    expect(issues.some((i) => i.field === 'pax.0.dob')).toBe(true)
  })

  it('d2d requires addresses unless TBD', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.service_mode = 'd2d'
    expect(validateTripRequest(d).some((i) => i.field === 'leg.0.pickup')).toBe(
      true,
    )
    d.legs[0]!.pickup_tbd = true
    d.legs[0]!.dropoff_tbd = true
    expect(validateTripRequest(d).length).toBe(0)
  })
})
