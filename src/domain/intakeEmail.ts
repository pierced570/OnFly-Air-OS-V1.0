import { createLlmAdapter } from '@/adapters/llm'
import { createCommsAdapter } from '@/adapters/comms'

/** Shared intake email handler (edge function will call this). */
export async function handleInboundEmail(opts: {
  from: string
  subject: string
  body: string
  requesterMatch: boolean
}) {
  if (!opts.requesterMatch) {
    return { ignored: true as const, reason: 'sender not a known requester' }
  }
  const llm = createLlmAdapter()
  const extracted = await llm.extractTripRequest(`${opts.subject}\n\n${opts.body}`)
  const comms = createCommsAdapter()
  await comms.send({
    channel: 'sms',
    to: '+10000000000',
    body: `OnFly: draft trip from email — review /trips/review (mock). Origin ${extracted.origin_text} → ${extracted.destination_text}`,
  })
  return { ignored: false as const, extracted }
}
