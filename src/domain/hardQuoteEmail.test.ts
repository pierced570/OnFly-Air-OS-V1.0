import { describe, expect, it } from 'vitest'
import { buildLogisticsQuoteOption } from './clientLogisticsQuote'
import {
  hardQuoteEmailSubject,
  renderHardQuoteEmailHtml,
  renderHardQuoteEmailText,
} from './hardQuoteEmail'

describe('hardQuoteEmail', () => {
  const opt = buildLogisticsQuoteOption({
    offer_id: 'o1',
    label: 'Option A',
    type_name: 'Citation CJ3',
    time_to_position_min: 90,
    quick_turn_min: 40,
    live_leg_min: 75,
    client_total: 6830,
    lane: 'KCAK → KHPN',
    goAtIso: '2026-07-26T23:37:00.000Z',
  })

  it('renders logo, aircraft, times, ETAs, and price — never operator/margin', () => {
    const html = renderHardQuoteEmailHtml({
      title: 'Logistics Quote Request (KCAK → KHPN)',
      options: [opt],
      acceptUrl: 'https://app.example/accept/abc',
      logoUrl: 'https://app.example/brand/onfly-logo.png',
      opsNotes: [
        'Ground transport on timeline — pickup / delivery legs included on this ETA sheet.',
        'Forklift required at cargo airports — confirm FBO capacity.',
      ],
    })
    expect(html).toContain('onfly-logo.png')
    expect(html).toContain('Option A: Citation CJ3')
    expect(html).toContain('1h 30m')
    expect(html).toContain('ETA')
    expect(html).toContain('ETD')
    expect(html).toContain('$6830')
    expect(html).toContain('All taxes and fees included')
    expect(html).toContain('vetted Part 135 carrier')
    expect(html).toContain('Review — Accept / Deny / Change request')
    expect(html).toContain('Ground &amp; ops')
    expect(html).toContain('Forklift required')
    expect(html).not.toMatch(/Pmoney|vendor cost|target margin|NET \$/i)
    expect(hardQuoteEmailSubject('Logistics Quote Request (KCAK → KHPN)')).toContain(
      'OnFly Air',
    )
  })

  it('text body includes aircraft and timeline lines', () => {
    const text = renderHardQuoteEmailText({
      title: 'Logistics Quote Request (KCAK → KHPN)',
      options: [opt],
      acceptUrl: 'https://app.example/accept/abc',
    })
    expect(text).toContain('Citation CJ3')
    expect(text).toContain('from Go')
    expect(text).toContain('loading and turn')
    expect(text).toContain('Live leg time')
    expect(text).toContain('$6830')
  })
})
