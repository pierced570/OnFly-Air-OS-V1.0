import { describe, expect, it } from 'vitest'
import {
  emptyPortalStop,
  fboStop,
  formatPortalStopTitle,
  hangarStop,
  portalStopFromLegacyAddress,
  portalStopToAddressLine,
  tbdStop,
} from './portalStopLocation'

describe('portalStopLocation', () => {
  it('TBD stays blank on address line', () => {
    const s = tbdStop('KCAK')
    expect(formatPortalStopTitle(s)).toBe('TBD')
    expect(portalStopToAddressLine(s)).toBeNull()
  })

  it('formats hangar and FBO lines', () => {
    expect(
      portalStopToAddressLine(
        hangarStop({ icao: 'KCAK', address: 'Hangar 5' }),
      ),
    ).toBe('Client hangar · Hangar 5')
    expect(
      portalStopToAddressLine(
        fboStop({
          icao: 'KHPN',
          fbo_id: 'f1',
          name: 'Signature',
          address: '1 Airport Rd',
        }),
      ),
    ).toBe('Signature · 1 Airport Rd')
  })

  it('recovers legacy address', () => {
    const s = portalStopFromLegacyAddress('Hangar 5 · CAK', 'KCAK')
    expect(s?.kind).toBe('custom')
    expect(s?.address).toContain('Hangar')
    expect(emptyPortalStop('KDFW').icao).toBe('KDFW')
  })
})
