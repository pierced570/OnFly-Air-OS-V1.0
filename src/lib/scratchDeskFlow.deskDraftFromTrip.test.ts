import { describe, expect, it } from 'vitest'
import { deskDraftFromTrip } from './scratchDeskFlow'

describe('deskDraftFromTrip', () => {
  it('rebuilds origin/dest/pax/ready for recommend on an open trip', () => {
    const draft = deskDraftFromTrip({
      lane: 'KCAK→KHPN',
      payload_summary: '2 pax + standard tooling (12x12x12 @ 75 lb)',
      ready_label: 'ASAP',
      client_id: null,
      quick: { client_name: 'Acme' },
    })
    expect(draft.origin_text).toBe('KCAK')
    expect(draft.destination_text).toBe('KHPN')
    expect(draft.pax_count).toBe(2)
    expect(draft.asap).toBe(true)
    expect(draft.ready_label).toBe('ASAP')
    expect(draft.pieces_text).toMatch(/standard tooling/i)
    expect(draft.client_name).toBe('Acme')
  })
})
