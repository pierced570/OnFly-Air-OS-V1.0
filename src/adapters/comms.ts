/**
 * Comms adapter — mock only (RingCentral SMS hard-killed).
 * Never put RINGCENTRAL_* secrets in VITE_* — they live in edge function secrets.
 */

import { adapterMode } from '@/adapters/types'
import { isSupabaseConfigured } from '@/lib/supabase'

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

/**
 * @deprecated Live RingCentral path hard-killed — always use MockCommsAdapter.
 */
export class RingCentralCommsAdapter implements CommsAdapter {
  async send(_msg: CommsMessage): Promise<{ id: string }> {
    throw new Error(
      'RingCentral SMS hard-killed — set createCommsAdapter back to live only after intentional restore',
    )
  }
}

export function getMockCommsLog() {
  return [...log]
}

export function clearMockCommsLog() {
  log.length = 0
}

/** Live RingCentral is hard-killed. Always false. */
export function isRealCommsEnabled(): boolean {
  void adapterMode // keep import used; live path disabled
  return false
}

/** Ready to call the edge function — always false while SMS is killed. */
export function isLiveCommsConfigured(): boolean {
  return false
}

/**
 * Whether availability pings / stand-downs may use SMS.
 * Mock adapter only — never hits RingCentral.
 */
export function isSmsDeliveryEnabled(): boolean {
  return true
}

/** Always mock — no live RingCentral. */
export function createCommsAdapter(): CommsAdapter {
  void isSupabaseConfigured
  return new MockCommsAdapter()
}
