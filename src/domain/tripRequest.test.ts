import { describe, expect, it } from 'vitest'
import {
  ASAP_MAX_HOURS,
  buildReturnLegs,
  draftNeedsPerLegPayload,
  draftPayloadKind,
  emptyTripRequestDraft,
  forkliftFromDraft,
  isAsapReady,
  newLeg,
  summaryFromDraft,
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
    d.cargo_weight_lbs = 50
    const issues = validateTripRequest(d, { requireEmail: true })
    expect(issues.some((i) => i.field === 'email')).toBe(true)
    expect(issues.some((i) => i.field === 'leg.0.origin')).toBe(true)
  })

  it('cargo requires weight', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.cargo_notes = '1 skid 48x40x48'
    expect(validateTripRequest(d).some((i) => i.field === 'cargo_weight')).toBe(
      true,
    )
    d.cargo_weight_lbs = 150
    expect(validateTripRequest(d).some((i) => i.field === 'cargo_weight')).toBe(
      false,
    )
  })

  it('skips cargo weight when dims not yet known', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.cargo_dims_status = 'not_yet'
    d.cargo_notes = ''
    expect(validateTripRequest(d).some((i) => i.field === 'cargo_weight')).toBe(
      false,
    )
    expect(summaryFromDraft(d)).toContain('dims TBD')
  })

  it('accepts weight embedded in dims text', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.cargo_notes = '1 skid 48x40x48 @ 90ea'
    expect(validateTripRequest(d).length).toBe(0)
    expect(forkliftFromDraft(d).level).toBe('none')
  })

  it('summarizes forklift required from heavy pieces', () => {
    const d = emptyTripRequestDraft()
    d.cargo_notes = '1 crate 48x40x48 @ 250ea'
    expect(summaryFromDraft(d)).toContain('forklift required')
    expect(forkliftFromDraft(d).level).toBe('required')
  })

  it('round trip requires hours on ground', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.cargo_weight_lbs = 40
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

  it('soft estimate may defer pax identity when flagged', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    d.cargo_only = false
    d.pax_details_deferred = true
    d.pax = [{ name: '', weight_lbs: '', dob: '' }]
    expect(
      validateTripRequest(d, { requirePaxDetails: false }).length,
    ).toBe(0)
    expect(summaryFromDraft(d)).toContain('pax TBD')
    expect(
      validateTripRequest(d, { requirePaxDetails: true }).some(
        (i) => i.field === 'pax_details_deferred',
      ),
    ).toBe(true)
  })

  it('d2d requires pickup + delivery addresses; ICAO optional', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.service_mode = 'd2d'
    d.cargo_weight_lbs = 75
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
    d.cargo_weight_lbs = 75
    d.legs[0]!.origin_icao = 'KCAK'
    d.legs[0]!.dest_icao = 'KMDW'
    expect(validateTripRequest(d).some((i) => i.field === 'leg.0.pickup')).toBe(
      true,
    )
    d.legs[0]!.pickup_address = '100 Industrial Pkwy, Akron OH'
    d.legs[0]!.dropoff_address = 'KMDW FBO ramp'
    expect(validateTripRequest(d).length).toBe(0)
  })

  it('multi-leg can mix pax and cargo per leg', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.legs[0]!.origin_icao = 'KGSP'
    d.legs[0]!.dest_icao = 'KCVG'
    d.legs[0]!.payload = 'pax'
    d.legs[0]!.pax = [
      { name: 'Alex Tech', weight_lbs: 180, dob: '1990-01-01' },
    ]
    d.legs.push({
      ...newLeg(),
      origin_icao: 'KCVG',
      dest_icao: 'KMHT',
      payload: 'cargo',
      cargo_notes: '1 box 12x12x12 @ 75ea',
      cargo_weight_lbs: 75,
    })
    d.cargo_only = false
    expect(draftPayloadKind(d)).toBe('both')
    expect(summaryFromDraft(d)).toContain('L1 GSP-CVG pax')
    expect(summaryFromDraft(d)).toContain('L2 CVG-MHT cargo')
    expect(validateTripRequest(d).length).toBe(0)
  })

  it('round trip breaks pax/cargo into outbound + return legs', () => {
    const d = emptyTripRequestDraft()
    d.email = 'a@b.co'
    d.direction = 'round_trip'
    d.hours_on_ground = 4
    d.legs[0]!.origin_icao = 'KGSP'
    d.legs[0]!.dest_icao = 'KCVG'
    d.legs[0]!.payload = 'pax'
    d.legs[0]!.pax = [
      { name: 'Alex Tech', weight_lbs: 180, dob: '1990-01-01' },
    ]
    d.return_legs = buildReturnLegs(d.legs)
    d.return_legs[0]!.payload = 'cargo'
    d.return_legs[0]!.cargo_notes = '1 box 12x12x12 @ 75ea'
    d.return_legs[0]!.cargo_weight_lbs = 75
    d.cargo_only = false
    expect(draftNeedsPerLegPayload(d)).toBe(true)
    expect(summaryFromDraft(d)).toContain('L1 GSP-CVG pax')
    expect(summaryFromDraft(d)).toContain('L2 CVG-GSP cargo')
    expect(validateTripRequest(d).length).toBe(0)
  })
})
