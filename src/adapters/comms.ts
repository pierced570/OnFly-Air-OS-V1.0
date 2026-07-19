export type CommsMessage = {
  channel: 'sms' | 'voice'
  to: string
  body: string
  from?: string
}

export interface CommsAdapter {
  send(msg: CommsMessage): Promise<{ id: string }>
}

const log: CommsMessage[] = []

export class MockCommsAdapter implements CommsAdapter {
  async send(msg: CommsMessage) {
    log.push(msg)
    console.info('[MockComms]', msg.channel, msg.to, msg.body.slice(0, 80))
    void import('@/lib/db/persist').then((m) =>
      m.persistCommsMessage({
        channel: msg.channel === 'voice' ? 'voice' : 'sms',
        to_addr: msg.to,
        body: msg.body,
      }),
    )
    return { id: `mock-sms-${log.length}` }
  }
}

export function getMockCommsLog() {
  return [...log]
}

export function createCommsAdapter(): CommsAdapter {
  // BLOCKED: RingCentral JWT + SMS from-numbers not sourced yet.
  const mode = (import.meta.env.VITE_COMMS_ADAPTER as string | undefined)
    ?.toLowerCase()
  if (mode === 'real') {
    console.warn(
      '[comms] VITE_COMMS_ADAPTER=real but RingCentral is not wired — using mock SMS. Unset VITE_COMMS_ADAPTER or set mock.',
    )
  }
  return new MockCommsAdapter()
}
