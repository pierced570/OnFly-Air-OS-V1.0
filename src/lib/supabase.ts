import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { TripState } from '@/domain/stateMachine'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anon)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anon!)
  : null

/**
 * Call the atomic trip_transition RPC.
 * Never update trips.state directly from application code.
 */
export async function tripTransition(
  tripId: string,
  toState: TripState,
  actor: string,
  payload: Record<string, unknown> = {},
) {
  if (!supabase) {
    throw new Error('Supabase not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  }
  const { data, error } = await supabase.rpc('trip_transition', {
    p_trip_id: tripId,
    p_to_state: toState,
    p_actor: actor,
    p_payload: payload,
  })
  if (error) throw error
  return data
}
