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
    return { id: `mock-sms-${log.length}` }
  }
}

export function getMockCommsLog() {
  return [...log]
}

export function createCommsAdapter(): CommsAdapter {
  return new MockCommsAdapter()
}
