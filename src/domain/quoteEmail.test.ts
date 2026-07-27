import { describe, expect, it } from 'vitest'
import type { ChainLeg } from '@/domain/etaChain'
import {
  etaRowsFromChain,
  quoteEmailSubject,
  renderQuoteEmailHtml,
  renderQuoteEmailText,
} from './quoteEmail'

function sampleChain(): ChainLeg[] {
  return [
    {
      seq: 1,
      type: 'position',
      branch: 'air',
      label: 'Position to KCAK',
      event: 'In Position',
      from: { lat: 0, lon: 0, icao: 'KLUK', tz: 'America/New_York' },
      to: { lat: 0, lon: 0, icao: 'KCAK', tz: 'America/New_York' },
      est_start: '2026-07-18T14:00:00.000Z',
      est_end: '2026-07-18T15:00:00.000Z',
      duration_min: 60,
      source: 'assumed',
      duration_source: 'test',
    },
    {
      seq: 2,
      type: 'air_leg',
      branch: 'merged',
      label: 'Air KCAK→KMDW',
      event: 'Wheels Up → Wheels Down',
      from: { lat: 0, lon: 0, icao: 'KCAK', tz: 'America/New_York' },
      to: { lat: 0, lon: 0, icao: 'KMDW', tz: 'America/Chicago' },
      est_start: '2026-07-18T16:00:00.000Z',
      est_end: '2026-07-18T17:30:00.000Z',
      duration_min: 90,
      source: 'assumed',
      duration_source: 'test',
    },
  ]
}

describe('quoteEmail', () => {
  it('builds ETA rows with local + Zulu', () => {
    const rows = etaRowsFromChain(sampleChain())
    expect(rows).toHaveLength(2)
    expect(rows[0]!.fromIcao).toBe('KLUK')
    expect(rows[1]!.label).toContain('KMDW')
    expect(rows[0]!.endZulu).toMatch(/Z/)
  })

  it('renders client-safe HTML with ETA sheet and no operator/cost', () => {
    const html = renderQuoteEmailHtml({
      originLabel: 'KCAK',
      destLabel: 'KMDW',
      total: 12500,
      airSubtotal: 11800,
      taxLines: [{ code: 'FET_CARGO', amount: 700, note: '6.25%' }],
      chain: sampleChain(),
      kind: 'estimated',
      refLabel: 'R-9001',
      acceptUrl: 'https://app.example/accept/abc',
    })
    expect(html).toContain('Estimated quote')
    expect(html).toContain('vetted Part 135 carrier')
    expect(html).toContain('Estimated timeline')
    expect(html).toContain('KCAK')
    expect(html).toContain('$12500.00')
    expect(html).toContain('Review — Accept / Deny / Change request')
    expect(html).not.toMatch(/Sonrise|operator_name|vendor cost|target margin/i)
    expect(quoteEmailSubject({
      originLabel: 'KCAK',
      destLabel: 'KMDW',
      total: 1,
      airSubtotal: 1,
      taxLines: [],
      chain: [],
      refLabel: 'R-9001',
    })).toContain('Estimated quote · R-9001')
  })

  it('text body includes timeline lines', () => {
    const text = renderQuoteEmailText({
      originLabel: 'KCAK',
      destLabel: 'KMDW',
      total: 100,
      airSubtotal: 100,
      taxLines: [],
      chain: sampleChain(),
    })
    expect(text).toContain('Estimated timeline')
    expect(text).toContain('Position to KCAK')
  })
})
