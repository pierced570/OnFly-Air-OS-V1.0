import { beforeEach, describe, expect, it } from 'vitest'
import { emptyOperatorBanking } from '@/domain/operatorPacket'
import {
  createOperatorInvite,
  getOperatorInvite,
  __resetOperatorInvitesForTests,
} from '@/lib/operatorInviteStore'
import { submitOperatorPacket } from '@/lib/operatorPacketFlow'
import { listOperatorDrafts } from '@/lib/operatorDraftStore'

describe('operatorPacketFlow', () => {
  beforeEach(() => {
    __resetOperatorInvitesForTests()
  })

  it('submits packet, parses D085 tails, completes invite', async () => {
    const inv = createOperatorInvite({
      email: 'ops@acme.test',
      company_name: 'Acme Air',
    })
    const d085 = new File(
      ['N123AB C208\nN456CD PC12\n'],
      'd085.txt',
      { type: 'text/plain' },
    )
    const result = await submitOperatorPacket({
      invite_token: inv.token,
      company_name: 'Acme Air',
      base_icao: 'KCAK',
      email: 'ops@acme.test',
      cell: '2165550100',
      contact_name: 'Pat Ops',
      quote_pref: 'text',
      banking: {
        ...emptyOperatorBanking(),
        ach_routing: '041000124',
        ach_account: '123456789',
      },
      charter: null,
      d085,
      coi: null,
    })
    expect(result.draft.name).toBe('Acme Air')
    expect(result.tails.length).toBeGreaterThanOrEqual(1)
    expect(getOperatorInvite(inv.token)?.completed_at).toBeTruthy()
    expect(listOperatorDrafts().some((d) => d.id === result.draft.id)).toBe(
      true,
    )
  })
})
