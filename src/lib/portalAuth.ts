/**
 * Portal magic-link session — link contact email → client, list own trips.
 * Guest track memory + portal client id clear together on sign-out so
 * home ↔ track ↔ login stay one loop.
 */

import { clearPortalClient } from '@/lib/clientOnboardStore'
import { clearPortalGuestTrack } from '@/lib/portalGuestTrack'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  mapPortalTripRow,
  portalEmailFromUser,
  type PortalSession,
  type PortalTripCard,
} from '@/domain/portalAuth'

export async function getPortalAuthSession(): Promise<PortalSession | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null
  const email = portalEmailFromUser(user)
  const linked = await ensurePortalUserLinked()
  return {
    userId: user.id,
    email,
    clientId: linked?.client_id ?? null,
  }
}

/**
 * Live portal auth — fires on magic-link exchange, refresh, and sign-out.
 * Callers should also run getPortalAuthSession once for the initial paint.
 */
export function subscribePortalAuth(
  onChange: (session: PortalSession | null) => void,
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {}
  }
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, authSession) => {
    // INITIAL_SESSION is covered by getPortalAuthSession on mount.
    if (event === 'INITIAL_SESSION') return
    void (async () => {
      if (!authSession?.user) {
        onChange(null)
        return
      }
      const email = portalEmailFromUser(authSession.user)
      const linked = await ensurePortalUserLinked()
      onChange({
        userId: authSession.user.id,
        email,
        clientId: linked?.client_id ?? null,
      })
    })()
  })
  return () => subscription.unsubscribe()
}

export async function ensurePortalUserLinked(): Promise<{
  client_id: string
  contact_email: string
} | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.rpc('link_portal_user')
  if (error) {
    console.warn('[portal] link_portal_user', error.message)
    return null
  }
  if (!data || typeof data !== 'object') return null
  const row = data as { client_id?: string; contact_email?: string }
  if (!row.client_id) return null
  return {
    client_id: String(row.client_id),
    contact_email: String(row.contact_email ?? ''),
  }
}

/** Active trips for the signed-in portal client (RLS-scoped). */
export async function listPortalTripsForSession(): Promise<PortalTripCard[]> {
  if (!isSupabaseConfigured || !supabase) return []
  await ensurePortalUserLinked()
  const { data, error } = await supabase
    .from('portal_trips')
    .select(
      'id,ref,state,lane_label,payload_summary,ready_label,updated_at',
    )
    .not('state', 'in', '("closed","lost","cancelled")')
    .order('ref', { ascending: false })
    .limit(50)
  if (error) {
    console.warn('[portal] portal_trips', error.message)
    return []
  }
  return (data ?? []).map((r) => mapPortalTripRow(r as Record<string, unknown>))
}

export async function signOutPortal(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

/** Sign out and drop guest track + local portal client so landing shows again. */
export async function endPortalSession(): Promise<void> {
  await signOutPortal()
  clearPortalGuestTrack()
  clearPortalClient()
}

/** After a company link succeeds, drop guest memory — company list is source of truth. */
export function promotePortalGuestToSignedIn(): void {
  clearPortalGuestTrack()
}
