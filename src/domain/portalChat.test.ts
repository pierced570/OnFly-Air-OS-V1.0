import { describe, expect, it } from 'vitest'
import {
  appendPortalChatMessage,
  clientPortalChatReplySubject,
  clientPortalChatReplyText,
  deskPortalChatNotifySubject,
  deskPortalChatNotifyText,
  mergePortalChatMessages,
  normalizePortalChat,
  portalChatFromEvents,
  renderClientPortalChatReplyHtml,
  renderDeskPortalChatNotifyHtml,
} from './portalChat'

describe('portalChat', () => {
  it('normalizes and de-dupes by id', () => {
    const rows = normalizePortalChat([
      {
        id: 'b',
        at: '2026-08-17T12:01:00.000Z',
        role: 'onfly',
        from_label: 'OnFly',
        body: 'Copy',
      },
      {
        id: 'a',
        at: '2026-08-17T12:00:00.000Z',
        role: 'client',
        from_label: 'Client',
        body: 'Hello',
      },
      {
        id: 'a',
        at: '2026-08-17T12:00:00.000Z',
        role: 'client',
        from_label: 'Client',
        body: 'Hello',
      },
      { id: 'x', at: '2026-08-17T12:02:00.000Z', role: 'ops', body: 'nope' },
      { foo: 1 },
    ])
    expect(rows.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('merges two threads without dropping either side', () => {
    const merged = mergePortalChatMessages(
      [
        {
          id: 'c1',
          at: '2026-08-17T12:00:00.000Z',
          role: 'client',
          from_label: 'Client',
          body: 'Need a forklift',
        },
      ],
      [
        {
          id: 'd1',
          at: '2026-08-17T12:05:00.000Z',
          role: 'onfly',
          from_label: 'OnFly',
          body: 'On it — confirming with the FBO.',
        },
      ],
    )
    expect(merged.map((m) => m.body)).toEqual([
      'Need a forklift',
      'On it — confirming with the FBO.',
    ])
  })

  it('rebuilds from append-only trip_events', () => {
    const fromEvents = portalChatFromEvents([
      {
        kind: 'state_transition',
        at: '2026-08-17T11:00:00.000Z',
        actor: 'system',
        payload: {},
      },
      {
        kind: 'portal_chat_message',
        at: '2026-08-17T12:00:00.000Z',
        actor: 'Client',
        payload: {
          id: 'm1',
          role: 'client',
          from_label: 'Client',
          body: 'Wheels-up still 1800Z?',
        },
      },
    ])
    expect(fromEvents).toHaveLength(1)
    expect(fromEvents[0]?.body).toMatch(/1800Z/)
  })

  it('appends a client message', () => {
    const { added, messages } = appendPortalChatMessage([], {
      role: 'client',
      body: '  Gate 3 hangar  ',
      from_label: 'Alex',
      id: 'fixed',
      at: '2026-08-17T12:00:00.000Z',
    })
    expect(added).toMatchObject({
      id: 'fixed',
      role: 'client',
      from_label: 'Alex',
      body: 'Gate 3 hangar',
    })
    expect(messages).toHaveLength(1)
  })

  it('rejects empty bodies', () => {
    expect(() =>
      appendPortalChatMessage([], { role: 'client', body: '   ' }),
    ).toThrow(/required/i)
  })

  it('builds a desk ping with a copy of the message', () => {
    const subject = deskPortalChatNotifySubject({
      code: 'AB123',
      ref: 88,
      lane: 'KCLT → KICT',
    })
    expect(subject).toContain('New portal chat')
    expect(subject).toContain('AB123')
    const text = deskPortalChatNotifyText({
      code: 'AB123',
      ref: 88,
      lane: 'KCLT → KICT',
      body: 'Need the AWB before 1400Z',
      fromLabel: 'Alex @ Acme',
      deskUrl: 'https://ofaops.onflyair.com/trips/t1',
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok',
    })
    expect(text).toContain('sent a new chat on the portal')
    expect(text).toContain('Need the AWB before 1400Z')
    expect(text).toContain('/trips/t1')
    const html = renderDeskPortalChatNotifyHtml({
      code: 'AB123',
      body: 'Need the AWB before 1400Z',
      deskUrl: 'https://ofaops.onflyair.com/trips/t1',
    })
    expect(html).toContain('Need the AWB before 1400Z')
    expect(html.toLowerCase()).not.toMatch(/vendor cost|margin %/i)
  })

  it('builds a client copy of the OnFly reply', () => {
    expect(
      clientPortalChatReplySubject({ code: 'AB123', lane: 'KCLT → KICT' }),
    ).toMatch(/OnFly message/)
    const text = clientPortalChatReplyText({
      code: 'AB123',
      body: 'Forklift is booked at Signature.',
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok',
    })
    expect(text).toContain('OnFly replied on your trip portal')
    expect(text).toContain('Forklift is booked at Signature.')
    const html = renderClientPortalChatReplyHtml({
      code: 'AB123',
      body: 'Forklift is booked at Signature.',
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok',
    })
    expect(html).toContain('Open tracking')
    expect(html.toLowerCase()).not.toMatch(/vendor cost|margin %|operator_name/i)
  })
})
