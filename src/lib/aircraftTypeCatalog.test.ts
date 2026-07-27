import { describe, expect, it } from 'vitest'
import {
  aircraftTypeOptions,
  suggestAircraftTypeOption,
  unifyAircraftType,
} from './aircraftTypeCatalog'

describe('aircraftTypeCatalog options', () => {
  it('includes canonical King Air / Baron labels', () => {
    const opts = aircraftTypeOptions()
    expect(opts).toContain('Baron 58')
    expect(opts).toContain('King Air 90')
    expect(opts).toContain('Citation CJ3')
  })

  it('suggests a dropdown value from free-text draft', () => {
    expect(suggestAircraftTypeOption('KA90')).toBe('King Air 90')
    expect(suggestAircraftTypeOption('barron')).toBe('Baron 58')
    expect(suggestAircraftTypeOption('C90')).toBe('King Air 90')
  })

  it('unifyAircraftType still normalizes aliases', () => {
    expect(unifyAircraftType('BE-58')).toBe('Baron 58')
  })
})
