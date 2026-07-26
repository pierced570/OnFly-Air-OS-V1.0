import { describe, expect, it } from 'vitest'
import {
  STANDARD_TOOLING,
  mentionsRoundTrip,
  mentionsScheduledTiming,
  mentionsTools,
  operatorMissionSummary,
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
})
