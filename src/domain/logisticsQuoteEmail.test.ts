import { describe, expect, it } from 'vitest'
import type { LogisticsQuoteOptionView } from '@/domain/clientLogisticsQuote'
import {
  logisticsQuoteEmailSubject,
  renderLogisticsQuoteEmailHtml,
  renderLogisticsQuoteEmailText,
} from './logisticsQuoteEmail'

function sampleOptions(): LogisticsQuoteOptionView[] {
  return [
    {
      offer_id: 'o1',
      label: 'Option A',
      aircraft_type: 'Pilatus PC-12',
      departure_label: 'CAK',
      destination_label: 'HPN',
      ttp_min: 90,
      turn_load_min: 40,
      live_leg_min: 75,
      position_eta: {
        duration: '1h 30m',
        clock: '18:00Z · 14:00 EDT',
      },
      etd: {
        duration: '0h 40m',
        clock: '18:40Z · 14:40 EDT',
      },
      arrival_eta: {
        duration: '1h 15m',
        clock: '19:55Z · 15:55 EDT',
      },
      price: 6000,
      taxes_fees_note: 'All taxes and fees included',
    },
    {
      offer_id: 'o2',
      label: 'Option B',
      aircraft_type: 'Citation CJ3',
      departure_label: 'CAK',
      destination_label: 'HPN',
      ttp_min: 60,
      turn_load_min: 30,
      live_leg_min: 55,
      position_eta: { duration: '1h 0m', clock: null },
      etd: { duration: '0h 30m', clock: null },
      arrival_eta: { duration: '0h 55m', clock: null },
      price: 8500,
      taxes_fees_note: 'All taxes and fees included',
    },
  ]
}

describe('logisticsQuoteEmail', () => {
  it('renders multi-option HTML cards without operator / cost / margin', () => {
    const html = renderLogisticsQuoteEmailHtml({
      title: 'Charter Quote',
      originLabel: 'CAK',
      destLabel: 'HPN',
      options: sampleOptions(),
      acceptUrl: 'https://app.example/accept/abc',
      logoUrl: 'https://cdn.example/logo.png',
    })
    expect(html).toContain('Charter Quote')
    expect(html).toContain('Aircraft Options')
    expect(html).toContain('Pilatus PC-12')
    expect(html).toContain('Citation CJ3')
    expect(html).toContain('Aircraft ready for pickup at CAK')
    expect(html).toContain('Est. arrival')
    expect(html).toContain('$6,000')
    expect(html).toContain('$8,500')
    expect(html).toContain('Review &amp; Accept Quote')
    expect(html).toContain('vetted Part 135 carrier')
    expect(html).not.toMatch(/Sonrise|operator_name|NTEST/i)
    expect(html).not.toContain('target margin')
    expect(html).not.toContain('vendor cost')
    expect(html.toLowerCase()).not.toContain('tail #')
    expect(
      logisticsQuoteEmailSubject({
        title: 'Charter Quote',
        originLabel: 'CAK',
        destLabel: 'HPN',
        options: [],
        refLabel: 'UZ300',
      }),
    ).toContain('Charter Quote (CAK → HPN) · UZ300')
  })

  it('text body lists each option with ETAs and price', () => {
    const text = renderLogisticsQuoteEmailText({
      title: 'Charter Quote',
      originLabel: 'CAK',
      destLabel: 'HPN',
      options: sampleOptions(),
      acceptUrl: '/accept/abc',
    })
    expect(text).toContain('Option A: Pilatus PC-12')
    expect(text).toContain('Option B: Citation CJ3')
    expect(text).toContain('Price: $6,000')
    expect(text).toContain('Review & accept:')
  })
})
