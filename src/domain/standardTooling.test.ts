import { describe, expect, it } from 'vitest'
import {
  STANDARD_CARGO_DEFAULTS,
  STANDARD_TOOLING,
  composeStandardCargoDims,
  mentionsRoundTrip,
  mentionsScheduledTiming,
  mentionsTools,
  needsStandardCargoAutofill,
  normalizeDeskPiecesText,
  operatorMissionSummary,
  parseStandardCargoDims,
  standardCargoPiecesText,
  toolingDimsForParse,
} from './standardTooling'

describe('standardTooling', () => {
  it('detects tools / tooling', () => {
    expect(mentionsTools('2 techs + tools')).toBe(true)
    expect(mentionsTools('need tooling')).toBe(true)
    expect(mentionsTools('2 Techs + Parts')).toBe(false)
  })

  it('detects round-trip only when said', () => {
    expect(mentionsRoundTrip('CVG–HPN one way')).toBe(false)
    expect(mentionsRoundTrip('round trip please')).toBe(true)
    expect(mentionsRoundTrip('RT return')).toBe(true)
  })

  it('detects scheduled timing cues', () => {
    expect(mentionsScheduledTiming('ready tomorrow')).toBe(true)
    expect(mentionsScheduledTiming('need by 9am')).toBe(true)
    expect(mentionsScheduledTiming('CVG HPN ASAP')).toBe(false)
  })

  it('strips label for dims parse', () => {
    expect(toolingDimsForParse(STANDARD_TOOLING.summary)).toBe(
      STANDARD_TOOLING.dims_text,
    )
    expect(toolingDimsForParse('1 skid 48x40x60 @ 800')).toBe(
      '1 skid 48x40x60 @ 800',
    )
  })

  it('operator summary uses standard tooling name', () => {
    expect(
      operatorMissionSummary({
        pieces_text: `${STANDARD_TOOLING.label} ${STANDARD_TOOLING.dims_text}`,
        pax_count: 2,
        cargo_only: false,
      }),
    ).toBe(`2 pax + ${STANDARD_TOOLING.summary}`)
  })

  it('operator summary assumes standard small cargo/tools when pieces blank', () => {
    expect(
      operatorMissionSummary({
        pieces_text: '',
        pax_count: 3,
        cargo_only: false,
      }),
    ).toBe(`3 pax + ${STANDARD_TOOLING.operator_assumed}`)
    expect(
      operatorMissionSummary({
        pieces_text: '   ',
        pax_count: 0,
        cargo_only: true,
      }),
    ).toBe(STANDARD_TOOLING.operator_assumed)
  })

  it('round-trips standard cargo L/W/H/weight boxes', () => {
    const fromTools = parseStandardCargoDims(
      `${STANDARD_TOOLING.label} ${STANDARD_TOOLING.dims_text}`,
    )
    expect(fromTools).toEqual(STANDARD_CARGO_DEFAULTS)
    expect(composeStandardCargoDims(fromTools)).toMatch(/standard tooling/i)
    expect(
      parseStandardCargoDims(
        composeStandardCargoDims({
          length: '48',
          width: '40',
          height: '60',
          weight: '800',
        }),
      ),
    ).toEqual({
      length: '48',
      width: '40',
      height: '60',
      weight: '800',
    })
  })

  it('normalizes single standard piece; keeps multi-piece free text', () => {
    expect(needsStandardCargoAutofill('')).toBe(true)
    expect(needsStandardCargoAutofill('   ')).toBe(true)
    expect(needsStandardCargoAutofill('standard tooling')).toBe(true)
    expect(
      needsStandardCargoAutofill(
        `${STANDARD_TOOLING.label} ${STANDARD_TOOLING.dims_text}`,
      ),
    ).toBe(false)
    expect(standardCargoPiecesText()).toMatch(/12x12x12 @ 75/i)
    expect(normalizeDeskPiecesText('12x12x12 @ 75ea')).toMatch(
      /standard tooling/i,
    )
    expect(
      normalizeDeskPiecesText('12x12x12 @ 75ea; 48x40x60 @ 800ea'),
    ).toBe('12x12x12 @ 75ea; 48x40x60 @ 800ea')
  })
})
