import { describe, expect, it } from 'vitest'
import { parseThreadActual } from './threadParse'

describe('parseThreadActual', () => {
  it('parses wheels up / landing in 2 hrs', () => {
    expect(parseThreadActual('wheels up')).toMatchObject({ kind: 'wheels_up' })
    expect(parseThreadActual('landing in 2 hrs')).toMatchObject({
      kind: 'eta_relative',
      minutes: 120,
    })
  })

  it('nonsense stays unknown', () => {
    expect(parseThreadActual('how is the weather')).toMatchObject({ kind: 'unknown' })
  })
})
