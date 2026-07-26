import { describe, expect, it } from 'vitest'
import { extractFromScratchNotes } from './scratchParse'

describe('extractFromScratchNotes', () => {
  it('pulls client, ICAO lane, skids, and ASAP', () => {
    const r = extractFromScratchNotes(
      `Acme MRO
KCAK → KMDW
2 skids 48x40x60 @ 800ea
ASAP AOG`,
    )
    expect(r.client_name).toMatch(/Acme/i)
    expect(r.origin_text).toBe('KCAK')
    expect(r.destination_text).toBe('KMDW')
    expect(r.pieces_text).toMatch(/48x40x60/)
    expect(r.asap).toBe(true)
    expect(r.payload_kind).toBe('cargo')
  })

  it('reads city arrow when no ICAO', () => {
    const r = extractFromScratchNotes('Need Akron to Chicago 1 skid 48x40x48 @ 400')
    expect(r.origin_text?.toLowerCase()).toContain('akron')
    expect(r.destination_text?.toLowerCase()).toContain('chicago')
  })
})
