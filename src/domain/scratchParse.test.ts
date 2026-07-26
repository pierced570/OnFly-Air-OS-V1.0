import { describe, expect, it } from 'vitest'
import { extractFromScratchNotes } from './scratchParse'
import { resolvePlaceToAirport } from './resolvePlace'

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

  it('parses PSA / CVG–HPN / techs + parts / ASAP scratchpad notes', () => {
    const r = extractFromScratchNotes(
      `PSA
CVG – HPN
2 Techs + Parts
One Way
Ready ASAP`,
    )
    expect(r.client_name).toBe('PSA')
    expect(r.origin_text).toBe('CVG')
    expect(r.destination_text).toBe('HPN')
    // Techs → pax; no tools mentioned → no cargo dims yet
    expect(r.pieces_text).toBeUndefined()
    expect(r.pax_count).toBe(2)
    expect(r.payload_kind).toBe('pax')
    expect(r.asap).toBe(true)
    expect(resolvePlaceToAirport(r.origin_text ?? '')?.icao).toBe('KCVG')
    expect(resolvePlaceToAirport(r.destination_text ?? '')?.icao).toBe('KHPN')
  })

  it('maps tools to standard tooling and techs to pax', () => {
    const r = extractFromScratchNotes(
      `PSA
CVG – HPN
2 techs + tools`,
    )
    expect(r.pax_count).toBe(2)
    expect(r.pieces_text).toMatch(/standard tooling/i)
    expect(r.pieces_text).toMatch(/12x12x12/)
    expect(r.payload_kind).toBe('both')
    expect(r.asap).toBe(true)
  })

  it('defaults ASAP + one-way when timing/direction omitted', () => {
    const r = extractFromScratchNotes('Acme\nKCAK → KMDW\n1 skid 48x40x48 @ 400')
    expect(r.asap).toBe(true)
    expect(r.notes).toMatch(/one-way/i)
    expect(r.notes).toMatch(/ASAP/i)
  })

  it('does not default ASAP when a ready clock is noted', () => {
    const r = extractFromScratchNotes(
      'KCAK → KMDW\n1 skid 48x40x48 @ 400\nready at 9:00am',
    )
    expect(r.asap).toBe(false)
    expect(r.ready_local).toMatch(/9/i)
  })

  it('does not treat ASAP as an airport code', () => {
    const r = extractFromScratchNotes('KCAK to KMDW\nReady ASAP')
    expect(r.origin_text).toBe('KCAK')
    expect(r.destination_text).toBe('KMDW')
    expect(r.asap).toBe(true)
  })

  it('ignores to inside tomorrow when parsing subject+body', () => {
    const r = extractFromScratchNotes(
      'Need aircraft tomorrow\n\n3 skids Akron to Chicago ready 9am',
    )
    expect(r.origin_text?.toLowerCase()).toContain('akron')
    expect(r.destination_text?.toLowerCase()).toContain('chicago')
  })

  it('accepts hyphen and slash lanes', () => {
    expect(extractFromScratchNotes('CVG-HPN ASAP').origin_text).toBe('CVG')
    expect(extractFromScratchNotes('CVG/HPN').destination_text).toBe('HPN')
    expect(extractFromScratchNotes('CVG — HPN').origin_text).toBe('CVG')
  })
})
