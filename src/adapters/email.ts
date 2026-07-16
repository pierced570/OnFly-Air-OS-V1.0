export type EmailMessage = {
  to: string
  subject: string
  html?: string
  text?: string
}

export interface EmailAdapter {
  send(msg: EmailMessage): Promise<{ id: string }>
}

const sent: EmailMessage[] = []

export class MockEmailAdapter implements EmailAdapter {
  async send(msg: EmailMessage) {
    sent.push(msg)
    console.info('[MockEmail]', msg.to, msg.subject)
    return { id: `mock-email-${sent.length}` }
  }
}

export function getMockSentEmails() {
  return [...sent]
}

export function createEmailAdapter(): EmailAdapter {
  return new MockEmailAdapter()
}
