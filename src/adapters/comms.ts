/**
 * Comms adapter — mock (default) or RingCentral via Supabase edge `send-sms`.
 * Never put RINGCENTRAL_* secrets in VITE_* — they live in edge function secrets.
 */

import { adapterMode } from '@/adapters/types'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

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
 * Calls supabase/functions/send-sms (RingCentral JWT → SMS).
 * Requires VITE_COMMS_ADAPTER=real + deployed function + RC secrets.
 */
export class RingCentralCommsAdapter implements CommsAdapter {
  async send(msg: CommsMessage) {
    if (msg.channel === 'voice') {
      throw new Error(
        'Voice not available on RingCentral adapter — Telnyx arrives later',
      )
    }
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(
        'RingCentral SMS requires Supabase — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
      )
    }
    const to = msg.to.trim()
    const body = msg.body.trim()
    if (!to) throw new Error('SMS to required')
    if (!body) throw new Error('SMS body required')

    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: {
        to,
        body,
        from: msg.from?.trim() || undefined,
      },
    })

    const result = data as {
      id?: string
      error?: string
      detail?: unknown
    } | null

    if (error) {
      const detail =
        result?.error &&
        (typeof result.detail === 'string'
          ? `${result.error}: ${result.detail}`
          : result.error)
      throw new Error(detail || error.message || 'send-sms edge function failed')
    }

    const id = result?.id
    if (!id) {
      throw new Error(
        result?.error
          ? `RingCentral: ${result.error}${
              typeof result.detail === 'string' ? ` — ${result.detail}` : ''
            }`
          : 'send-sms returned no id — check RINGCENTRAL_* secrets',
      )
    }

    log.push(msg)
    console.info('[RingCentralSMS]', to, id)
    void import('@/lib/db/persist').then((m) =>
      m.persistCommsMessage({
        channel: 'sms',
        to_addr: to,
        body,
      }),
    )
    return { id }
  }
}

export function getMockCommsLog() {
  return [...log]
}

/** True when the app will attempt live RingCentral (still needs edge secrets). */
export function isRealCommsEnabled(): boolean {
  return adapterMode('VITE_COMMS_ADAPTER', 'mock') === 'real'
}

/** Ready to call the edge function (adapter=real + Supabase public URL/key). */
export function isLiveCommsConfigured(): boolean {
  return isRealCommsEnabled() && isSupabaseConfigured
}

/**
 * Whether availability pings / stand-downs may use SMS.
 * Mock adapter "sends" into the phone simulator; real needs Supabase + edge.
 */
export function isSmsDeliveryEnabled(): boolean {
  const mode = adapterMode('VITE_COMMS_ADAPTER', 'mock')
  if (mode === 'mock') return true
  return isLiveCommsConfigured()
}

export function createCommsAdapter(): CommsAdapter {
  if (isLiveCommsConfigured()) return new RingCentralCommsAdapter()
  if (isRealCommsEnabled() && !isSupabaseConfigured) {
    console.warn(
      '[comms] VITE_COMMS_ADAPTER=real needs Supabase — using mock SMS',
    )
  }
  return new MockCommsAdapter()
}
