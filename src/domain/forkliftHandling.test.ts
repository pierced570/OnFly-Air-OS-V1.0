import { describe, expect, it } from 'vitest'
import {
  FORKLIFT_RECOMMENDED_MIN_LBS,
  FORKLIFT_REQUIRED_OVER_LBS,
  forkliftHandlingFromPieces,
  forkliftHandlingFromWeights,
} from './forkliftHandling'

describe('forkliftHandling', () => {
  it('is none under 100 lb', () => {
    expect(forkliftHandlingFromWeights([50, 99]).level).toBe('none')
    expect(forkliftHandlingFromWeights([50]).summary_bit).toBeNull()
  })

  it('recommends at 100–200 lb inclusive', () => {
    expect(forkliftHandlingFromWeights([100]).level).toBe('recommended')
    expect(forkliftHandlingFromWeights([150]).level).toBe('recommended')
    expect(forkliftHandlingFromWeights([200]).level).toBe('recommended')
    expect(forkliftHandlingFromWeights([200]).summary_bit).toBe(
      'forklift recommended',
    )
  })

  it('requires over 200 lb', () => {
    expect(forkliftHandlingFromWeights([201]).level).toBe('required')
    expect(forkliftHandlingFromWeights([800]).level).toBe('required')
    expect(forkliftHandlingFromWeights([800]).summary_bit).toBe(
      'forklift required',
    )
  })

  it('uses the heaviest object, not shipment total', () => {
    // 3× 80 lb = 240 total, but each object is 80 → none
    expect(
      forkliftHandlingFromPieces([{ weight_lbs: 80 }, { weight_lbs: 80 }]).level,
    ).toBe('none')
    // one heavy object wins
    expect(
      forkliftHandlingFromPieces([
        { weight_lbs: 50 },
        { weight_lbs: 250 },
      ]).level,
    ).toBe('required')
  })

  it('thresholds are documented constants', () => {
    expect(FORKLIFT_RECOMMENDED_MIN_LBS).toBe(100)
    expect(FORKLIFT_REQUIRED_OVER_LBS).toBe(200)
  })
})
