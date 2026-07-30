import { describe, expect, it } from 'vitest'
import {
  SOFT_HOME_EXTRA_HOURS,
  SOFT_PRICING_DISCLAIMER,
  SOFT_REPO_HOURS,
  buildSoftLegTiming,
  buildSoftPricingPackage,
  doorFitsWithSpare,
  formatHoursMinutes,
  flightMinutesFromNmGs,
  verticalToSoftClass,
  mockSoftPricingGuidelines,
} from '@/domain/softPricing'

describe('softPricing', () => {
  it('maps verticals to soft classes', () => {
    expect(verticalToSoftClass('sep')).toBe('single_engine')
    expect(verticalToSoftClass('mep')).toBe('twin_piston')
    expect(verticalToSoftClass('setp')).toBe('turboprop')
    expect(verticalToSoftClass('metp')).toBe('turboprop')
    expect(verticalToSoftClass('vlj_light')).toBe('light_jet')
    expect(verticalToSoftClass('mid_heavy')).toBe('midsize')
    expect(verticalToSoftClass('cargo')).toBe('heavy_freight')
    expect(verticalToSoftClass('other')).toBeNull()
  })

  it('formats hours as mockup 2h 46m', () => {
    expect(formatHoursMinutes(166)).toBe('2h 46m')
    expect(formatHoursMinutes(150)).toBe('2h 30m')
    expect(formatHoursMinutes(51)).toBe('0h 51m')
    expect(formatHoursMinutes(60)).toBe('1h 00m')
  })

  it('builds timing: 2.5hr repo, live=nm/gs, return=live+1hr', () => {
    const t = buildSoftLegTiming(270, 270)
    expect(t.repo_min).toBe(Math.round(SOFT_REPO_HOURS * 60))
    expect(t.live_min).toBe(60)
    expect(t.home_min).toBe(60 + Math.round(SOFT_HOME_EXTRA_HOURS * 60))
    expect(flightMinutesFromNmGs(360, 130)).toBe(166)
  })

  it('fits door with ~2 in spare on two smallest sides', () => {
    // 48×40×60 → two smallest 40×48; door 53×52 with 2" spare → 51×50 OK
    expect(
      doorFitsWithSpare(53, 52, { l_in: 48, w_in: 40, h_in: 60 }),
    ).toBe('fits')
    // 40×48 vs 44×37 spare → 42×35 — 40 ok, 48 > 35 and 48 > 42
    expect(
      doorFitsWithSpare(44, 37, { l_in: 48, w_in: 40, h_in: 60 }),
    ).toBe('no_fit')
  })

  it('builds six class cards with hourly ranges and disclaimer', () => {
    const pkg = buildSoftPricingPackage({
      origin_icao: 'KCAK',
      dest_icao: 'KHPN',
      live_nm: 360,
      pieces: [
        {
          count: 1,
          l_in: 48,
          w_in: 40,
          h_in: 60,
          weight_lbs: 800,
          stackable: false,
        },
      ],
      fleet: [],
    })

    expect(pkg.classes).toHaveLength(6)
    expect(pkg.origin_display).toBe('CAK')
    expect(pkg.dest_display).toBe('HPN')
    expect(pkg.disclaimer).toBe(SOFT_PRICING_DISCLAIMER)
    expect(pkg.cargo_badges[0]).toMatch(/48×40×60/i)
    expect(pkg.math_cards).toHaveLength(3)
    expect(pkg.door_rows.length).toBeGreaterThanOrEqual(6)
    expect(pkg.similar_missions.length).toBe(4)

    const tp = pkg.classes.find((c) => c.class_id === 'turboprop')!
    expect(tp.fit.fit).toBe('fits')
    expect(tp.price_low).toBeGreaterThan(0)
    expect(tp.price_high).toBeGreaterThan(tp.price_low)
    expect(tp.timing.repo_min).toBe(150)

    const se = pkg.classes.find((c) => c.class_id === 'single_engine')!
    expect(se.fit.fit).toBe('no_fit')
    expect(se.fit.explanation).toMatch(/reference only/i)

    const guide = mockSoftPricingGuidelines(pkg)
    expect(guide).toContain('not the actual price')
  })

  it('keeps finite price ranges without tails', () => {
    const pkg = buildSoftPricingPackage({
      origin_icao: 'KHPN',
      dest_icao: 'KTEB',
      live_nm: 20,
      pieces: [],
      fleet: [],
    })
    for (const c of pkg.classes) {
      expect(Number.isFinite(c.price_low)).toBe(true)
      expect(c.price_high).toBeGreaterThanOrEqual(c.price_low)
    }
    expect(JSON.stringify(pkg)).not.toMatch(/\bN[0-9]{1,5}[A-Z]{0,2}\b/)
  })

  it('dims assumed small → every class fits', () => {
    const pkg = buildSoftPricingPackage({
      origin_icao: 'KCAK',
      dest_icao: 'KHPN',
      live_nm: 360,
      pieces: [
        {
          count: 1,
          l_in: 12,
          w_in: 12,
          h_in: 12,
          weight_lbs: 50,
          stackable: true,
        },
      ],
      fleet: [],
      dims_assumed_small: true,
    })
    expect(pkg.fit_summary).toMatch(/assume the cargo is small enough/i)
    expect(pkg.cargo_badges.some((b) => /assumed small/i.test(b))).toBe(true)
    for (const c of pkg.classes) {
      expect(c.fit.fit).toBe('fits')
      expect(c.recommended).toBe(true)
    }
  })
})
