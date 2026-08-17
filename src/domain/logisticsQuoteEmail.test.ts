import { describe, expect, it } from 'vitest'
import {
  buildLogisticsQuoteOption,
  finalizeLogisticsQuoteOptions,
  PORTAL_ACCEPT_CTA,
} from '@/domain/clientLogisticsQuote'
import {
  logisticsQuoteEmailSubject,
  renderLogisticsQuoteEmailHtml,
  renderLogisticsQuoteEmailText,
} from './logisticsQuoteEmail'

function sampleOptions() {
  return finalizeLogisticsQuoteOptions([
    buildLogisticsQuoteOption({
      offer_id: 'o1',
      label: 'Option A',
      option_index: 0,
      type_name: 'Cessna 310',
      time_to_position_min: 90,
      quick_turn_min: 40,
      live_leg_min: 75,
      client_total: 12658,
      lane: 'KCAK → KHPN',
      goAtIso: '2026-07-26T13:00:00.000Z',
    }),
    buildLogisticsQuoteOption({
      offer_id: 'o2',
      label: 'Option B',
      option_index: 1,
      type_name: 'Aerostar 600',
      time_to_position_min: 130,
      quick_turn_min: 30,
      live_leg_min: 80,
      client_total: 10634,
      lane: 'KCAK → KHPN',
      goAtIso: '2026-07-26T13:00:00.000Z',
    }),
  ])
}

describe('logisticsQuoteEmail', () => {
  it('renders charter quote HTML matching dark brand shell', () => {
    const html = renderLogisticsQuoteEmailHtml({
      title: 'Charter Quote',
      originLabel: 'Akron CAK',
      destLabel: 'White Plains HPN',
      options: sampleOptions(),
      acceptUrl: 'https://app.example/accept/abc',
      logoUrl: 'https://cdn.example/logo.png',
      refLabel: 'VK982',
      missionChips: [
        { label: 'Cargo only' },
        { label: '1 pc' },
        { label: '800 lb' },
        { label: 'Ready ASAP' },
      ],
      intro:
        'Two aircraft options below, both able to launch today. Prices are all-in — taxes and fees included. Click here to accept quote in portal.',
    })
    expect(html).toContain('Akron CAK')
    expect(html).toContain('White Plains HPN')
    expect(html).toContain('Quote · VK982')
    expect(html).toContain('Cargo only')
    expect(html).toContain('Cessna 310')
    expect(html).toContain('Aerostar 600')
    expect(html).not.toMatch(/Recommended/i)
    expect(html).not.toMatch(/Earliest delivery/i)
    expect(html).not.toMatch(/Cheapest|Fastest/i)
    expect(html).toContain('At Pickup Location (CAK)')
    expect(html).toContain('Wheels Up For (HPN)')
    expect(html).toContain('Landing ETA (HPN)')
    expect(html).toContain('Delivered (HPN FBO)')
    expect(html).toContain('$12,658')
    expect(html).toContain('$10,634')
    expect(html).toContain(PORTAL_ACCEPT_CTA)
    expect(html).not.toContain('Go to portal to accept')
    expect(html).not.toContain('Accept Option 1')
    expect(html).not.toContain('Accept Option 2')
    expect(html).toContain('https://app.example/accept/abc')
    expect(html).not.toContain('option=o1')
    // Uniform gold portal CTAs (ink text — survives email link restyles)
    expect(html.match(new RegExp(PORTAL_ACCEPT_CTA, 'g'))?.length).toBeGreaterThanOrEqual(
      2,
    )
    expect(html).toContain('background:#c9a227')
    expect(html).toContain('color:#0c0c0e !important')
    expect(html).toContain('bgcolor="#0c0c0e"')
    // Dark shell — no white option cards / cream body that wash out logo
    expect(html).not.toContain('background:#fff')
    expect(html).not.toContain('background:#f7f2e3')
    expect(html).toContain('background:#0c0c0e')
    expect(html).toContain('background:#1c1c1f')
    expect(html).toContain('All-in includes')
    expect(html).toContain('On accept:')
    expect(html).toContain('24-hr ops')
    expect(html).toContain('vetted Part 135 carrier')
    expect(html).not.toContain('Ready to launch')
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

  it('text body lists each option with milestones and price', () => {
    const text = renderLogisticsQuoteEmailText({
      title: 'Charter Quote',
      originLabel: 'CAK',
      destLabel: 'HPN',
      options: sampleOptions(),
      acceptUrl: '/accept/abc',
      refLabel: 'VK982',
    })
    expect(text).toContain('Option 1 · Cessna 310')
    expect(text).toContain('Option 2 · Aerostar 600')
    expect(text).toContain('Price: $12,658')
    expect(text).toContain(`${PORTAL_ACCEPT_CTA}:`)
    expect(text).not.toContain('Review & accept:')
    expect(text).toMatch(/At Pickup Location \(CAK\):/i)
  })
})
