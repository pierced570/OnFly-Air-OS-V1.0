import { describe, expect, it } from 'vitest'
import { setScratchPadBody } from '@/lib/scratchPadStore'
import {
  deskDraftFromExtract,
  parseScratchToDeskDraft,
  recommendForDeskDraft,
} from '@/lib/scratchDeskFlow'
import { extractFromScratchNotes } from '@/domain/scratchParse'
import { mergeScratchExtract } from '@/adapters/llm'

describe('scratch desk parse', () => {
  it('fills draft from PSA CVG–HPN call notes', async () => {
    setScratchPadBody(`PSA
CVG – HPN
2 Techs + Parts
One Way
Ready ASAP`)
    const { draft } = await parseScratchToDeskDraft()
    expect(draft.client_name).toBe('PSA')
    expect(draft.origin_text).toBe('CVG')
    expect(draft.destination_text).toBe('HPN')
    expect(draft.asap).toBe(true)
    expect(draft.ready_label).toBe('ASAP')
    expect(draft.pieces_text).toMatch(/Techs/i)
    expect(draft.pax_count).toBe(2)
    expect(draft.parse_source).toMatch(/heuristic|claude|demo/)
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
})
