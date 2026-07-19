import { describe, expect, it } from 'vitest'
import {
  defaultBankTarget,
  introSmsBody,
  pickThreadNumber,
  portalInviteSmsBody,
  roleGetsPortalInvite,
  roleOnOpsThread,
} from './tripThread'

describe('tripThread', () => {
  it('ops roles are on thread; client roles get portal', () => {
    expect(roleOnOpsThread('pilot')).toBe(true)
    expect(roleOnOpsThread('operator_ops')).toBe(true)
    expect(roleOnOpsThread('client_supply')).toBe(false)
    expect(roleGetsPortalInvite('client_supply')).toBe(true)
    expect(roleGetsPortalInvite('supply_chain')).toBe(true)
  })

  it('intro SMS names the trip thread', () => {
    const body = introSmsBody({
      tripRef: 347,
      lane: 'CAK→MDW',
      threadNumber: '+15557100001',
    })
    expect(body).toMatch(/#347/)
    expect(body).toMatch(/\+15557100001/)
    expect(body).not.toMatch(/bid/i)
  })

  it('portal invite points at login', () => {
    const body = portalInviteSmsBody({
      clientName: 'Acme',
      portalUrl: 'https://app.onflyair.com/portal/login',
    })
    expect(body).toMatch(/portal/)
    expect(body).toMatch(/Acme/)
  })

  it('pickThreadNumber skips numbers in use', () => {
    const n = pickThreadNumber(
      [
        { number: '+1A', active: true, trip_id: 't1' },
        { number: '+1B', active: true, trip_id: null },
      ],
      {
        candidateCells: ['+15551212'],
        activeTrips: [
          { id: 't1', thread_number: '+1A', cells: ['+15559999'] },
        ],
      },
    )
    expect(n).toBe('+1B')
  })

  it('defaultBankTarget maps client vs operator', () => {
    expect(defaultBankTarget('client_ap')).toBe('client')
    expect(defaultBankTarget('pilot')).toBe('operator')
    expect(defaultBankTarget('dispatcher')).toBe('skip')
  })
})
