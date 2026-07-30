import { describe, expect, it } from 'vitest'
import { mergeScratchExtract } from '@/adapters/llm'
import { extractFromScratchNotes } from '@/domain/scratchParse'
import { addClient } from '@/lib/clientStore'
import { setScratchPadBody } from '@/lib/scratchPadStore'
import {
  deskDraftFromExtract,
  newDeskLeg,
  parseScratchToDeskDraft,
  recommendForDeskDraft,
  syncDeskDraftDerived,
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
    expect(draft.pieces_text).toBe('')
    expect(draft.pax_count).toBe(2)
    expect(draft.roundtrip).toBe(false)
    expect(draft.po).toBe('')
    expect(draft.legs[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Desk draft has no live_leg / repo — operators enter live on the offer link.
    expect(
      Object.prototype.hasOwnProperty.call(draft.legs[0] ?? {}, 'live_leg_time'),
    ).toBe(false)
    expect(
      Object.prototype.hasOwnProperty.call(draft.legs[0] ?? {}, 'repo_time'),
    ).toBe(false)
  })

  it('tools → standard tooling on desk draft', async () => {
    setScratchPadBody(`PSA
CVG – HPN
2 techs + tools`)
    const { draft } = await parseScratchToDeskDraft()
    expect(draft.pax_count).toBe(2)
    expect(draft.pieces_text).toMatch(/standard tooling/i)
    expect(draft.timing).toBe('asap')
    expect(draft.roundtrip).toBe(false)
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

  it('supports multiple legs when needed', () => {
    const draft = deskDraftFromExtract(
      extractFromScratchNotes('PSA\nCVG – HPN\nReady ASAP'),
    )
    draft.legs = [
      draft.legs[0]!,
      newDeskLeg({ origin_icao: 'KHPN', dest_icao: 'KCVG' }),
    ]
    const synced = syncDeskDraftDerived(draft)
    expect(synced.legs).toHaveLength(2)
    expect(synced.legs[0]?.origin_icao).toBe('KCVG')
    expect(synced.legs[1]?.dest_icao).toBe('KCVG')
    // Recommend still keys off outbound (first) lane
    expect(synced.origin_text).toBe('KCVG')
    expect(synced.destination_text).toBe('KHPN')
  })

  it('builds two desk legs from GSP → CVG → MHT call notes', async () => {
    setScratchPadBody(`PSA
2 Pax + tools
Pickup small part GSP
then two pax in CVG
then drop off in MHT`)
    const { draft } = await parseScratchToDeskDraft()
    expect(draft.client_name).toBe('PSA')
    expect(draft.legs).toHaveLength(2)
    expect(draft.legs[0]?.origin_icao).toBe('KGSP')
    expect(draft.legs[0]?.dest_icao).toBe('KCVG')
    expect(draft.legs[1]?.origin_icao).toBe('KCVG')
    expect(draft.legs[1]?.dest_icao).toBe('KMHT')
    expect(draft.origin_text).toBe('KGSP')
    expect(draft.destination_text).toBe('KMHT')
    expect(draft.pax_count).toBe(2)
    expect(draft.pieces_text).toMatch(/standard tooling/i)
  })

  it('mergeScratchExtract prefers longer stop chain from heuristics', () => {
    const h = extractFromScratchNotes(
      `PSA
Pickup small part GSP
then two pax in CVG
then drop off in MHT`,
    )
    const merged = mergeScratchExtract(
      {
        raw: 'x',
        notes: 'llm endpoints only',
        origin_text: 'GSP',
        destination_text: 'MHT',
      },
      h,
    )
    expect(merged.stop_texts).toEqual(['GSP', 'CVG', 'MHT'])
    expect(merged.origin_text).toBe('GSP')
    expect(merged.destination_text).toBe('MHT')
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
