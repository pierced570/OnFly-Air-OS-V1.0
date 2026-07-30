import { describe, expect, it } from 'vitest'
import {
  SOFT_HOME_EXTRA_HOURS,
  SOFT_PRICING_DISCLAIMER,
  SOFT_REPO_HOURS,
  buildSoftLegTiming,
  buildSoftPricingPackage,
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

  it('formats hours and minutes exactly', () => {
    expect(formatHoursMinutes(150)).toBe('2 hr 30 min')
    expect(formatHoursMinutes(60)).toBe('1 hr')
    expect(formatHoursMinutes(45)).toBe('45 min')
    expect(formatHoursMinutes(0)).toBe('0 min')
  })

  it('builds timing: 2.5hr repo, live=nm/gs, home=live+1hr', () => {
    // 270 NM @ 270 kt = 60 min live; home = 60+60 = 120
    const t = buildSoftLegTiming(270, 270)
    expect(t.repo_min).toBe(Math.round(SOFT_REPO_HOURS * 60))
    expect(t.live_min).toBe(60)
    expect(t.home_min).toBe(60 + Math.round(SOFT_HOME_EXTRA_HOURS * 60))
    expect(t.live_nm).toBe(270)
    expect(t.home_nm).toBe(270)
    expect(t.repo_nm).toBe(Math.round(SOFT_REPO_HOURS * 270))
    expect(t.circuit_nm).toBe(t.repo_nm + 270 + 270)
    expect(flightMinutesFromNmGs(400, 400)).toBe(60)
  })

  it('builds a full package with six classes, doors, and disclaimer', () => {
    const pkg = buildSoftPricingPackage({
      origin_icao: 'kcak',
      dest_icao: 'kmdw',
      live_nm: 300,
      pieces: [
        {
          count: 1,
          l_in: 48,
          w_in: 40,
          h_in: 48,
          weight_lbs: 400,
          stackable: false,
        },
      ],
      fleet: [
        {
          type_name: 'King Air 200',
          category: 'turboprop',
          engines: 'multi turboprop',
          door_w_in: 52,
          door_h_in: 52,
          max_payload_lbs: 3500,
          avg_op_per_nm_circuit: 11.5,
          trips_logged: 40,
        },
        {
          type_name: 'Citation CJ3',
          category: 'light jet',
          engines: 'multi jet',
          door_w_in: 30,
          door_h_in: 36,
          max_payload_lbs: 1800,
          avg_op_per_nm_circuit: 15,
          trips_logged: 12,
        },
      ],
    })

    expect(pkg.classes).toHaveLength(6)
    expect(pkg.disclaimer).toBe(SOFT_PRICING_DISCLAIMER)
    expect(pkg.origin_icao).toBe('KCAK')
    expect(pkg.live_nm).toBe(300)

    const tp = pkg.classes.find((c) => c.class_id === 'turboprop')!
    expect(tp.timing.repo_min).toBe(150)
    expect(tp.rate_source).toBe('history')
    expect(tp.fit.fit).toBe('fits')
    expect(tp.fit.door_examples[0]?.type_name).toBe('King Air 200')
    expect(tp.timing_blurb).toMatch(/Repo 2 hr 30 min/)
    expect(tp.pricing_logic).toMatch(/2\.5 hr repo/)
    expect(tp.example_types.length).toBeGreaterThan(0)

    const jet = pkg.classes.find((c) => c.class_id === 'light_jet')!
    // 48x40 face may not fit 30x36 door
    expect(jet.fit.fit).toBe('no_fit')

    const guide = mockSoftPricingGuidelines(pkg)
    expect(guide).toContain(SOFT_PRICING_DISCLAIMER)
    expect(guide.toLowerCase()).toMatch(/turboprop|fit/)
  })

  it('keeps class quotes portal-safe (no tails; finite prices)', () => {
    const pkg = buildSoftPricingPackage({
      origin_icao: 'KHPN',
      dest_icao: 'KTEB',
      live_nm: 20,
      pieces: [],
      fleet: [
        {
          type_name: 'Cessna 208',
          category: 'piston',
          engines: 'single piston',
          door_w_in: 49,
          door_h_in: 50,
          max_payload_lbs: 2500,
        },
      ],
    })
    expect(pkg.origin_icao).toBe('KHPN')
    for (const c of pkg.classes) {
      expect(Number.isFinite(c.air_estimate)).toBe(true)
      expect(c.air_estimate).toBeGreaterThan(0)
    }
    const blob = JSON.stringify(pkg)
    expect(blob).not.toMatch(/\bN[0-9]{1,5}[A-Z]{0,2}\b/)
  })
})
