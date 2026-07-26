import { describe, expect, it } from 'vitest'
import { tripRequestDraftFromScratchNotes } from './scratchToTripRequest'

describe('scratchToTripRequest', () => {
  it('builds a trip request draft from call pad notes', () => {
    const draft = tripRequestDraftFromScratchNotes(
      'PSA\nCKB — DFW\n2 Techs + Tools\nASAP',
    )
    expect(draft.client_name).toBe('PSA')
    expect(draft.timing).toBe('asap')
    expect(draft.notes).toContain('CKB')
    expect(draft.legs[0]?.origin_icao).toBeTruthy()
    expect(draft.legs[0]?.dest_icao).toBeTruthy()
    expect(draft.cargo_only).toBe(false)
    expect(draft.pax.length).toBe(2)
  })
})
