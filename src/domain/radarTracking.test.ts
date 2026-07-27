import { describe, expect, it } from 'vitest'
import {
  alertEnabledTails,
  applyAlertToggle,
  applySeedHit,
  chunkTails,
  emptyTrack,
  mergeLastKnown,
  trackingSummary,
} from './radarTracking'

const known = {
  lat: 41,
  lon: -81,
  alt: 0,
  gs: 0,
  seenAt: '2026-07-27T12:00:00.000Z',
  phase: 'on_ground' as const,
  laddBlocked: false,
  lastTakeoffAt: null,
  lastLandingAt: '2026-07-27T11:00:00.000Z',
}

describe('radarTracking', () => {
  it('chunks unique normalized tails', () => {
    expect(chunkTails(['n1', 'N1', 'N2'], 1)).toEqual([['N1'], ['N2']])
  })

  it('keeps newer last-known', () => {
    const older = { ...known, seenAt: '2026-07-27T10:00:00.000Z' }
    const newer = { ...known, seenAt: '2026-07-27T12:00:00.000Z', lat: 42 }
    expect(mergeLastKnown(older, newer).lat).toBe(42)
    expect(mergeLastKnown(newer, older).lat).toBe(42)
  })

  it('toggles alerts and clears provider id on disable', () => {
    let row = emptyTrack('N123AB')
    row = applySeedHit(row, known)
    row = applyAlertToggle(row, true, { providerAlertId: '99' })
    expect(row.alertEnabled).toBe(true)
    expect(row.providerAlertId).toBe('99')
    row = applyAlertToggle(row, false)
    expect(row.alertEnabled).toBe(false)
    expect(row.providerAlertId).toBeNull()
  })

  it('summarizes seeded + alert counts', () => {
    const a = applySeedHit(emptyTrack('N1'), known)
    const b = applyAlertToggle(emptyTrack('N2'), true, {
      providerAlertId: '1',
    })
    const c = emptyTrack('N3')
    expect(trackingSummary([a, b, c])).toEqual({
      total: 3,
      seeded: 1,
      alertOn: 1,
    })
    expect(alertEnabledTails([a, b, c])).toEqual(['N2'])
  })
})
