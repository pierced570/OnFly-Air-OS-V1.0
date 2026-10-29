/**
 * Comms adapter — mock (default) or RingCentral via Supabase edge:
 *   send-sms  → SMS
 *   ring-desk → RingOut (desk line rings; no Twilio)
 * Never put RINGCENTRAL_* secrets in VITE_* — they live in edge function secrets.
 *
 * Live: VITE_COMMS_ADAPTER=real + edge secrets + SMS_DISABLED/DESK_RING_DISABLED≠true.
 */

import { adapterMode } from '@/adapters/types'
import { messageFromEdgeInvoke } from '@/lib/edgeFunctionError'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type CommsMessage = {
  channel: 'sms' | 'voice'
  to: string
  body: string
  from?: string
}

export type DeskRingOpts = {
  /** Desk number that rings first (default +18585297860 / secret). */
  desk?: string
  /** Second leg after answer (staff cell / IVR). */
  connectTo?: string
  /** Logged on mock / edge — not spoken. */
  reason?: string
  playPrompt?: boolean
}

export interface CommsAdapter {
  send(msg: CommsMessage): Promise<{ id: string }>
  /** RingCentral RingOut — make the company desk line ring. */
  ringDesk(opts?: DeskRingOpts): Promise<{ id: string }>
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

  async ringDesk(opts?: DeskRingOpts) {
    const desk = (opts?.desk ?? '+18585297860').trim()
    const msg: CommsMessage = {
      channel: 'voice',
      to: desk,
      body: opts?.reason?.trim() || 'desk ring',
      from: opts?.connectTo,
    }
    log.push(msg)
    console.info('[MockComms] ring-desk', desk, msg.body.slice(0, 80))
    void import('@/lib/db/persist').then((m) =>
      m.persistCommsMessage({
        channel: 'voice',
        to_addr: desk,
        body: msg.body,
      }),
    )
    return { id: `mock-ring-${log.length}` }
  }
}

/**
 * Calls supabase/functions/send-sms (RingCentral JWT → SMS)
 * and ring-desk (RingCentral RingOut → desk rings).
 * Requires VITE_COMMS_ADAPTER=real + deployed functions + RC secrets.
 */
export class RingCentralCommsAdapter implements CommsAdapter {
  async send(msg: CommsMessage) {
    if (msg.channel === 'voice') {
      return this.ringDesk({
        desk: msg.to,
        reason: msg.body,
        connectTo: msg.from,
      })
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
      disabled?: boolean
    } | null

    if (error) {
      const detail = await messageFromEdgeInvoke({
        data: result,
        error,
        fallback: 'SMS send failed (send-sms)',
      })
      throw new Error(detail)
    }

    const id = result?.id
    if (!id) {
      throw new Error(
        (await messageFromEdgeInvoke({
          data: result,
          error: null,
          fallback: 'send-sms returned no id — check RINGCENTRAL_* secrets',
        })) || 'send-sms returned no id — check RINGCENTRAL_* secrets',
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

  async ringDesk(opts?: DeskRingOpts) {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(
        'RingCentral desk ring requires Supabase — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
      )
    }
    const { data, error } = await supabase.functions.invoke('ring-desk', {
      body: {
        desk: opts?.desk?.trim() || undefined,
        connectTo: opts?.connectTo?.trim() || undefined,
        reason: opts?.reason?.trim() || undefined,
        playPrompt: opts?.playPrompt,
      },
    })

    const result = data as {
      id?: string
      error?: string
      detail?: unknown
      disabled?: boolean
    } | null

    if (error) {
      const detail = await messageFromEdgeInvoke({
        data: result,
        error,
        fallback: 'Desk ring failed (ring-desk)',
      })
      throw new Error(detail)
    }

    const id = result?.id
    if (!id) {
      throw new Error(
        (await messageFromEdgeInvoke({
          data: result,
          error: null,
          fallback:
            'ring-desk returned no id — check RINGCENTRAL_* + RingOut permission',
        })) ||
          'ring-desk returned no id — check RINGCENTRAL_* + RingOut permission',
      )
    }

    const desk = (opts?.desk ?? '+18585297860').trim()
    log.push({
      channel: 'voice',
      to: desk,
      body: opts?.reason?.trim() || 'desk ring',
      from: opts?.connectTo,
    })
    console.info('[RingCentralRingOut]', desk, id)
    void import('@/lib/db/persist').then((m) =>
      m.persistCommsMessage({
        channel: 'voice',
        to_addr: desk,
        body: opts?.reason?.trim() || 'desk ring',
      }),
    )
    return { id }
  }
}

export function getMockCommsLog() {
  return [...log]
}

export function clearMockCommsLog() {
  log.length = 0
}

/** True when the app will attempt live RingCentral (still needs edge secrets). */
export function isRealCommsEnabled(): boolean {
  // Default mock — opt in with VITE_COMMS_ADAPTER=real.
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
