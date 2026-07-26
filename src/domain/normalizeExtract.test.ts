import { describe, expect, it } from 'vitest'
import { mergeTripExtract, normalizeTripExtract } from './normalizeExtract'

describe('normalizeTripExtract', () => {
  it('coerces loose Claude JSON without stripping mission text', () => {
    const n = normalizeTripExtract(
      {
        client_name: ' PSA ',
        origin_text: 'CVG',
        destination_text: 'HPN',
        pieces_text: '2 Techs + Parts',
        asap: 'yes',
        pax_count: '2',
        payload_kind: 'BOTH',
        hazmat: 'false',
      },
      'raw\u2013dash',
    )
    expect(n.client_name).toBe('PSA')
    expect(n.asap).toBe(true)
    expect(n.pax_count).toBe(2)
    expect(n.payload_kind).toBe('both')
    expect(n.hazmat).toBe(false)
    expect(n.pieces_text).toBe('2 Techs + Parts')
    expect(n.raw).toBe('raw\u2013dash')
  })

  it('merge prefers Claude fields and fills blanks from heuristics', () => {
    const claude = normalizeTripExtract(
      { origin_text: 'CVG', destination_text: 'HPN', notes: 'claude' },
      'x',
    )
    const heur = normalizeTripExtract(
      {
        client_name: 'PSA',
        origin_text: 'CVG',
        destination_text: 'HPN',
        asap: true,
        pieces_text: '2 Techs + Parts',
      },
      'x',
    )
    const m = mergeTripExtract(claude, heur)
    expect(m.client_name).toBe('PSA')
    expect(m.asap).toBe(true)
    expect(m.pieces_text).toMatch(/Techs/)
    expect(m.parse_source).toBe('claude+heuristic')
  })
})
