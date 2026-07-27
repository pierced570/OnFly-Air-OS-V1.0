import { describe, expect, it } from 'vitest'
import { resolveTripClientName } from './resolveTripClientName'

describe('resolveTripClientName', () => {
  it('prefers denormalized client_name', () => {
    expect(
      resolveTripClientName(
        {
          client_name: 'Acme',
          quick: { client_name: 'Other' } as never,
          events: [],
          participants: [],
        },
        'Directory',
      ),
    ).toBe('Acme')
  })

  it('falls back through quick → directory → events → participants', () => {
    expect(
      resolveTripClientName({
        client_name: null,
        quick: undefined,
        events: [
          {
            at: '',
            actor: 'x',
            kind: 'desk_scratch_spool',
            payload: { client_name: 'From Event' },
          },
        ],
        participants: [],
      }),
    ).toBe('From Event')

    expect(
      resolveTripClientName({
        client_name: null,
        quick: undefined,
        events: [],
        participants: [
          {
            id: '1',
            role: 'client_ap',
            name: 'Pat',
            company: 'PSA Airlines',
            cell: '',
            email: '',
            in_thread: false,
            released_at: null,
            invite_sent_at: null,
          },
        ],
      }),
    ).toBe('PSA Airlines')
  })
})
