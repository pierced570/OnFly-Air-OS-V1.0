import { describe, expect, it } from 'vitest'
import {
  airportsFromLane,
  collectPortalDesktopDocs,
  mapPortalDesktopStatus,
  portalDesktopBucket,
  portalDesktopCta,
  portalDesktopCurrentStep,
  portalDesktopStatusMeta,
  portalDesktopStepLabels,
  portalDesktopTripSummary,
  resolveAirportText,
  type PortalDesktopTrip,
} from './portalDesktopTrips'

describe('portalDesktopTrips', () => {
  it('buckets live / pending / history from status', () => {
    expect(portalDesktopBucket('live')).toBe('live')
    expect(portalDesktopBucket('quoted')).toBe('pending')
    expect(portalDesktopBucket('confirmed')).toBe('pending')
    expect(portalDesktopBucket('done')).toBe('history')
  })

  it('maps spine states to glass statuses', () => {
    expect(mapPortalDesktopStatus({ state: 'in_progress' })).toBe('live')
    expect(
      mapPortalDesktopStatus({ state: 'quoted_hard', hardQuoteSent: true }),
    ).toBe('quoted')
    expect(mapPortalDesktopStatus({ state: 'booked' })).toBe('confirmed')
    expect(mapPortalDesktopStatus({ state: 'delivered' })).toBe('done')
    expect(mapPortalDesktopStatus({ state: 'intake' })).toBe('requested')
  })

  it('picks CTA by status', () => {
    expect(portalDesktopCta('quoted')).toBe('Approve quote')
    expect(portalDesktopCta('sourcing')).toBe('Call the desk')
    expect(portalDesktopCta('done')).toBe('Book again')
  })

  it('uses live vs pre-flight timeline labels', () => {
    expect(portalDesktopStepLabels('live')[0]).toBe('Quoted')
    expect(portalDesktopStepLabels('requested')[0]).toBe('Requested')
    expect(portalDesktopCurrentStep('quoted')).toBe(1)
    expect(portalDesktopCurrentStep('done')).toBe(5)
  })

  it('resolves ICAO / IATA / city for request fields', () => {
    expect(resolveAirportText('KSAN')?.icao).toBe('KSAN')
    expect(resolveAirportText('SAN')?.icao).toBe('KSAN')
    expect(resolveAirportText('San Diego')?.icao).toBe('KSAN')
  })

  it('parses lane endpoints into airports', () => {
    const { from, to } = airportsFromLane('KCAK→KHPN')
    expect(from.icao).toBe('KCAK')
    expect(to.icao).toBe('KHPN')
  })

  it('builds trip summary + status chips', () => {
    expect(portalDesktopTripSummary({ live: 2, pending: 3 })).toBe(
      '2 in the air · 3 pending',
    )
    expect(portalDesktopStatusMeta('quoted').chip).toBe('Quote ready')
  })

  it('collects docs across trips', () => {
    const stub = (partial: Partial<PortalDesktopTrip>): PortalDesktopTrip => ({
      id: '1',
      displayId: 'T-2402',
      po: '88102',
      status: 'done',
      from: { icao: 'KSEA', city: 'Seattle', lat: 0, lon: 0 },
      to: { icao: 'KLAX', city: 'Los Angeles', lat: 0, lon: 0 },
      tail: null,
      aircraft: null,
      load: '2 pcs',
      service: 'Door to door',
      courier: '—',
      dispatcher: null,
      progress: 1,
      telemetry: null,
      lastEvent: '',
      nextEvent: '',
      steps: [],
      currentStep: 5,
      docs: ['Quote', 'Invoice', 'POD'],
      date: 'Oct 28',
      acceptHref: null,
      trackHref: null,
      state: 'delivered',
      ...partial,
    })
    const docs = collectPortalDesktopDocs([stub({})])
    expect(docs).toHaveLength(3)
    expect(docs[0]?.kind).toBe('QTE')
    expect(docs[2]?.kind).toBe('POD')
  })
})
