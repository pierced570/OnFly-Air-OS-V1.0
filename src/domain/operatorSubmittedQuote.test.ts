import { describe, expect, it } from 'vitest'
import { operatorSubmittedQuoteSnapshot } from './operatorSubmittedQuote'

describe('operatorSubmittedQuoteSnapshot', () => {
  it('returns null when no NET was submitted', () => {
    expect(
      operatorSubmittedQuoteSnapshot({
        state: 'stood_down',
        price_net: null,
      }),
    ).toBeNull()
  })

  it('shows quoted facts for reopen after submit', () => {
    const snap = operatorSubmittedQuoteSnapshot({
      state: 'quoted',
      price_net: 5000,
      type_name: 'King Air 200',
      tail: 'N1LK',
      time_to_position_min: 90,
      quick_turn_min: 40,
      live_leg_min: 75,
      fee_scope: 'aircraft_and_fees',
      notes: 'Crew overnight OK',
    })
    expect(snap).not.toBeNull()
    expect(snap!.headline).toBe('Your submitted quote')
    expect(snap!.price_label).toBe('$5,000 NET')
    expect(snap!.ttp_label).toBe('1h 30m')
    expect(snap!.turn_label).toBe('0h 40m')
    expect(snap!.live_label).toBe('1h 15m')
    expect(snap!.fee_label).toBe('fees included')
    expect(snap!.notes).toBe('Crew overnight OK')
    expect(snap!.blurb.toLowerCase()).toContain('review only')
    expect(`${snap!.headline} ${snap!.blurb}`.toLowerCase()).not.toContain('bid')
  })

  it('uses win copy when selected', () => {
    const snap = operatorSubmittedQuoteSnapshot({
      state: 'selected',
      price_net: 4800,
      tail: 'N2LK',
    })
    expect(snap!.headline).toMatch(/you're on this trip/i)
    expect(snap!.blurb.toLowerCase()).not.toContain('bid')
  })

  it('keeps stood-down quote visible for records', () => {
    const snap = operatorSubmittedQuoteSnapshot({
      state: 'stood_down',
      price_net: 5200,
      type_name: 'PC-12',
      tail: 'N3LK',
    })
    expect(snap!.headline).toBe('Your submitted quote')
    expect(snap!.blurb.toLowerCase()).toContain('another carrier')
    expect(snap!.blurb.toLowerCase()).not.toContain('bid')
    expect(snap!.price_net).toBe(5200)
  })
})
