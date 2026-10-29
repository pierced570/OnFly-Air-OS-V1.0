import { describe, expect, it } from 'vitest'
import pack from '@/fixtures/part135_fleet_by_state.json'
import {
  PART135_CATS,
  buildPart135FleetView,
  defaultPart135Filters,
  filteredPart135Aircraft,
  part135OperatorPasses,
  splitApprovedBands,
  type Part135FleetPack,
} from './part135Fleet'

const data = pack as Part135FleetPack

describe('part135Fleet', () => {
  it('OH approved band order: AirNet II → Castle → Priority → Air Z → Aery', () => {
    const f = defaultPart135Filters()
    f.state = 'OH'
    const view = buildPart135FleetView(data, f)
    const oh = view.states.find((s) => s.state === 'OH')
    expect(oh).toBeTruthy()
    const { approved } = splitApprovedBands(oh!.operators)
    expect(approved.map((o) => o.onfly_name)).toEqual([
      'AirNet II',
      'Castle Aviation',
      'Priority Air Charter',
      'Air Z',
      'Aery Aviation',
    ])
  })

  it('hides NetJets and Alaska by default', () => {
    const f = defaultPart135Filters()
    const view = buildPart135FleetView(data, f)
    const names = view.states.flatMap((s) =>
      s.operators.map((o) => o.operator),
    )
    expect(names.some((n) => /netjets/i.test(n))).toBe(false)
    expect(view.states.some((s) => s.state === 'AK')).toBe(false)

    f.hideSkip = false
    f.hideAkHiPr = false
    const open = buildPart135FleetView(data, f)
    expect(
      open.states
        .flatMap((s) => s.operators)
        .some((o) => /netjets/i.test(o.operator)),
    ).toBe(true)
    expect(open.states.some((s) => s.state === 'AK')).toBe(true)
  })

  it('cert search 2BZA returns Sonrise; MU-2 finds OK Air 1st', () => {
    const f = defaultPart135Filters()
    f.q = '2BZA'
    let view = buildPart135FleetView(data, f)
    expect(view.total_operators).toBe(1)
    expect(view.states[0]?.operators[0]?.onfly_name).toBe('Sonrise Aviation')

    f.q = 'MU-2'
    view = buildPart135FleetView(data, f)
    expect(
      view.states.some((s) =>
        s.operators.some((o) => /OK AIR 1ST/i.test(o.operator)),
      ),
    ).toBe(true)
  })

  it('Sonrise expand: cert note + six workhorse freight flown tails', () => {
    const sonrise = data.states.IN!.find((o) => o.faa_cert === '2BZA')!
    expect(sonrise.cert_note).toMatch(/Sonrise Aviation = B & F/i)
    const tails = filteredPart135Aircraft(
      sonrise,
      new Set(PART135_CATS),
    )
    expect(tails).toHaveLength(6)
    expect(tails.filter((t) => t.aircraft_type === 'Cessna 310')).toHaveLength(
      4,
    )
    expect(
      tails.filter((t) => t.aircraft_type === 'Cessna 404 Titan'),
    ).toHaveLength(2)
    expect(tails.every((t) => t.workhorse && t.freight_history && t.onfly_flown_type)).toBe(
      true,
    )
  })

  it('SEP-only chip drops Sonrise and keeps single-engine ops', () => {
    const f = defaultPart135Filters()
    f.cats = new Set(['SEP'])
    const view = buildPart135FleetView(data, f)
    expect(
      view.states
        .flatMap((s) => s.operators)
        .some((o) => o.faa_cert === '2BZA'),
    ).toBe(false)
    expect(
      view.states
        .flatMap((s) => s.operators)
        .every((o) => part135OperatorPasses(o, f) && o.SEP > 0),
    ).toBe(true)
  })

  it('state header counts track filtered operators', () => {
    const f = defaultPart135Filters()
    f.state = 'OH'
    f.approvedOnly = true
    const view = buildPart135FleetView(data, f)
    const oh = view.states[0]!
    expect(oh.approved_count).toBe(5)
    expect(oh.operator_count).toBe(5)
    expect(oh.approved_names[0]).toBe('AirNet II')
  })
})
