import { describe, expect, it } from 'vitest'
import {
  ASAP_MAX_HOURS,
  buildReturnLegs,
  emptyTripRequestDraft,
  isAsapReady,
  laneFromDraft,
  syncReturnLegs,
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
    d.return_legs = buildReturnLegs(d.legs)
    d.hours_on_ground = ''
    expect(
      validateTripRequest(d).some((i) => i.field === 'hours_on_ground'),
    ).toBe(true)
  })

  it('mirrors outbound into return legs (reversed)', () => {
    const d = emptyTripRequestDraft()
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.legs.push({
      ...d.legs[0]!,
      id: 'leg-2',
      origin_icao: 'KMDW',
      dest_icao: 'KORD',
    })
    const ret = buildReturnLegs(d.legs)
    expect(ret).toHaveLength(2)
    expect(ret[0]).toMatchObject({ origin_icao: 'KORD', dest_icao: 'KMDW' })
    expect(ret[1]).toMatchObject({ origin_icao: 'KMDW', dest_icao: 'KCAK' })
  })

  it('lane includes return when round trip', () => {
    const d = emptyTripRequestDraft()
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.direction = 'round_trip'
    d.hours_on_ground = 2
    d.return_legs = buildReturnLegs(d.legs)
    expect(laneFromDraft(d)).toBe('KCAK→KMDW · KMDW→KCAK')
  })

  it('syncReturnLegs preserves return date/time', () => {
    const d = emptyTripRequestDraft()
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    const first = buildReturnLegs(d.legs)
    first[0]!.date = '2026-08-01'
    first[0]!.pickup_time = '14:00'
    d.legs[0]!.dest_icao = 'KORD'
    const synced = syncReturnLegs(d.legs, first)
    expect(synced[0]).toMatchObject({
      origin_icao: 'KORD',
      dest_icao: 'KCAK',
      date: '2026-08-01',
      pickup_time: '14:00',
      id: first[0]!.id,
    })
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

  it('d2d requires pickup + delivery addresses; ICAO optional', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.service_mode = 'd2d'
    expect(validateTripRequest(d).some((i) => i.field === 'leg.0.pickup')).toBe(
      true,
    )
    expect(validateTripRequest(d).some((i) => i.field === 'leg.0.dropoff')).toBe(
      true,
    )
    expect(validateTripRequest(d).some((i) => i.field === 'leg.0.origin')).toBe(
      false,
    )
    d.legs[0]!.pickup_address = '100 Industrial Pkwy, Akron OH'
    d.legs[0]!.dropoff_address = '500 Warehouse Rd, Chicago IL'
    expect(validateTripRequest(d).length).toBe(0)
  })

  it('mixed requires ICAOs and door addresses', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.service_mode = 'mixed'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    expect(validateTripRequest(d).some((i) => i.field === 'leg.0.pickup')).toBe(
      true,
    )
    d.legs[0]!.pickup_address = '100 Industrial Pkwy, Akron OH'
    d.legs[0]!.dropoff_address = 'KMDW FBO ramp'
    expect(validateTripRequest(d).length).toBe(0)
  })
})
