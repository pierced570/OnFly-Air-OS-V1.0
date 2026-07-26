import { describe, expect, it } from 'vitest'
import { mergeScratchExtract } from '@/adapters/llm'
import { extractFromScratchNotes } from '@/domain/scratchParse'
import { addClient } from '@/lib/clientStore'
import { setScratchPadBody } from '@/lib/scratchPadStore'
import {
  deskDraftFromExtract,
  parseScratchToDeskDraft,
  recommendForDeskDraft,
} from '@/lib/scratchDeskFlow'

describe('scratch desk parse', () => {
  it('fills draft from PSA CVG–HPN call notes', async () => {
    setScratchPadBody(`PSA
CVG – HPN
2 Techs + Parts
One Way
Ready ASAP`)
    const { draft } = await parseScratchToDeskDraft()
    expect(draft.client_name).toBe('PSA')
    expect(draft.timing).toBe('asap')
    expect(draft.asap).toBe(true)
    expect(draft.legs[0]?.origin_icao).toBe('KCVG')
    expect(draft.legs[0]?.dest_icao).toBe('KHPN')
    expect(draft.origin_text).toBe('KCVG')
    expect(draft.destination_text).toBe('KHPN')
    expect(draft.pieces_text).toMatch(/Techs/i)
    expect(draft.pax_count).toBe(2)
    // Desk draft has no live_leg field — operators enter that on the offer link.
    expect(
      Object.prototype.hasOwnProperty.call(draft.legs[0] ?? {}, 'live_leg_time'),
    ).toBe(false)
  })

  it('resolves CVG/HPN and scores without hard-failing on techs mission', async () => {
    const draft = deskDraftFromExtract(
      extractFromScratchNotes(`PSA
CVG – HPN
2 Techs + Parts
Ready ASAP`),
    )
    const rec = await recommendForDeskDraft(draft)
    expect(rec.error).toBeUndefined()
    expect(rec.lane).toBe('KCVG→KHPN')
  })

  it('mergeScratchExtract fills gaps from heuristics', () => {
    const h = extractFromScratchNotes('PSA\nCVG – HPN\nReady ASAP')
    const merged = mergeScratchExtract(
      { raw: 'x', notes: 'llm thin' },
      h,
    )
    expect(merged.client_name).toBe('PSA')
    expect(merged.origin_text).toBe('CVG')
    expect(merged.asap).toBe(true)
  })

  it('filters operators using previous client parameters', async () => {
    const client = addClient({
      name: `Desk Rules ${crypto.randomUUID().slice(0, 6)}`,
      rules: {
        multi_engine_only: true,
        freight_only: true,
        hazmat_allowed: false,
      },
    })
    const draft = deskDraftFromExtract(
      extractFromScratchNotes(`PSA
CVG – HPN
2 Techs + Parts
Ready ASAP`),
    )
    draft.client_id = client.id
    draft.client_name = client.name
    const rec = await recommendForDeskDraft(draft)
    expect(rec.client_rules_applied).toBe(true)
    expect(rec.rule_chips).toEqual(
      expect.arrayContaining(['No single-engine', 'Freight only', 'No hazmat']),
    )
    // No hazmat on draft — still scores; SE pistons should be filtered/gated by rules.
    expect(rec.error).toBeUndefined()
  })
})
