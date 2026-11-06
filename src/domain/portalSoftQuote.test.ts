import { describe, expect, it } from 'vitest'
import {
  PORTAL_SOFT_QUOTE_CLASSES,
  formatSoftQuotePriceShort,
  softQuoteBookCta,
  softQuoteClassAtNm,
  softQuoteFor,
  softQuoteHardNotes,
  softQuotePointLabel,
} from './portalSoftQuote'

describe('portalSoftQuote', () => {
  it('keeps three tunable classes with badges + payload', () => {
    expect(PORTAL_SOFT_QUOTE_CLASSES).toHaveLength(3)
    expect(PORTAL_SOFT_QUOTE_CLASSES[0]).toMatchObject({
      name: 'Turboprop',
      badge: 'Best value',
      payload: '≤ 1,000 lb',
      kts: 270,
      rate: 2400,
      maxNm: 1300,
    })
    expect(PORTAL_SOFT_QUOTE_CLASSES[1]?.badge).toBe('Fastest for parts')
    expect(PORTAL_SOFT_QUOTE_CLASSES[2]?.name).toBe('Mid-size jet')
  })

  it('computes block time and ± band from nm', () => {
    const nm = 1000
    const light = softQuoteClassAtNm(PORTAL_SOFT_QUOTE_CLASSES[1]!, nm)
    // hrs = max(1000/400 + 0.4, 1.5) = 2.9
    expect(light.hrs).toBeCloseTo(2.9, 5)
    expect(light.block).toMatch(/2h 54m block/)
    expect(light.opacity).toBe(1)
    expect(light.price).toMatch(/^\$[\d,]+ – \$[\d,]+$/)
    expect(light.priceShort).toMatch(/^\$[\d.]+k–\$[\d.]+k$/)
    expect(softQuoteBookCta(light)).toMatch(/^Book light jet · \$/)
  })

  it('formats short CTA bands', () => {
    expect(formatSoftQuotePriceShort(8300, 10400)).toBe('$8.3k–$10.4k')
    expect(formatSoftQuotePriceShort(22000, 27800)).toBe('$22k–$27.8k')
    expect(formatSoftQuotePriceShort(31000, 31000)).toBe('$31k–$31k')
  })

  it('flags fuel-stop / dim opacity past maxNm', () => {
    const over = softQuoteClassAtNm(PORTAL_SOFT_QUOTE_CLASSES[0]!, 2000)
    expect(over.overRange).toBe(true)
    expect(over.opacity).toBe(0.45)
    expect(over.sub).toMatch(/Fuel stop/)
  })

  it('quotes a coast-to-coast pair with nm + sm labels', () => {
    const q = softQuoteFor(
      { lat: 32.7336, lon: -117.1897, code: 'KSAN' },
      { lat: 40.7769, lon: -73.874, code: 'KLGA' },
    )
    expect(q.nm).toBeGreaterThan(2000)
    expect(q.sm).toBeGreaterThan(q.nm)
    expect(q.nmLabel).toMatch(/^\d/)
    expect(q.classes).toHaveLength(3)
  })

  it('builds hard-quote desk notes from points', () => {
    const notes = softQuoteHardNotes(
      { lat: 33.94, lon: -118.4, code: 'KLAX' },
      { lat: 39.86, lon: -104.67, code: 'KDEN' },
      'Light jet',
    )
    expect(notes).toMatch(/^Soft quote KLAX → KDEN \([\d,]+ nm\) · prefer Light jet/)
    expect(notes).toMatch(/please send hard quote$/)
  })

  it('labels custom points without ICAO', () => {
    expect(softQuotePointLabel({ lat: 33.4, lon: -79.6 })).toBe(
      '33.4°, 79.6°W',
    )
    expect(softQuotePointLabel({ lat: 35.6, lon: 120.8 })).toBe(
      '35.6°, 120.8°E',
    )
  })

  it('includes city when labeling a resolved airport', () => {
    expect(
      softQuotePointLabel({
        lat: 32.73,
        lon: -117.19,
        code: 'KSAN',
        city: 'San Diego, CA',
      }),
    ).toBe('KSAN · San Diego, CA')
  })
})
