import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mem = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
  clear: () => {
    mem.clear()
  },
})

const rpc = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc,
    from,
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {},
    },
  },
}))

describe('listPortalTripsForSession domain', () => {
  beforeEach(() => {
    mem.clear()
    rpc.mockReset()
    from.mockReset()
  })

  afterEach(() => {
    mem.clear()
  })

  it('loads trips via RPC for domain sign-in (no auth.uid)', async () => {
    mem.set(
      'onfly.portal.domain_session',
      JSON.stringify({ email: 'pierce@onflyair.com', clientId: 'psa' }),
    )
    rpc.mockResolvedValue({
      data: [
        {
          id: 'trip-1',
          ref: 42,
          state: 'booked',
          lane_label: 'KCLT→KATL',
          payload_summary: 'AOG parts',
          ready_label: 'ASAP',
          updated_at: '2026-08-16T00:00:00Z',
        },
      ],
      error: null,
    })

    const { listPortalTripsForSession } = await import('@/lib/portalAuth')
    const rows = await listPortalTripsForSession()
    expect(rpc).toHaveBeenCalledWith('portal_trips_for_work_email', {
      p_email: 'pierce@onflyair.com',
    })
    expect(from).not.toHaveBeenCalled()
    expect(rows).toEqual([
      {
        id: 'trip-1',
        ref: 42,
        state: 'booked',
        lane: 'KCLT→KATL',
        ready_label: 'ASAP',
        payload_summary: 'AOG parts',
        updated_at: '2026-08-16T00:00:00Z',
      },
    ])
  })
})
