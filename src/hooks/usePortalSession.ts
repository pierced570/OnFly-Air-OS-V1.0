/**
 * Shared portal auth for home / track / request — one session loop.
 */

import { useEffect, useState } from 'react'
import type { PortalSession } from '@/domain/portalAuth'
import {
  getPortalAuthSession,
  promotePortalGuestToSignedIn,
  subscribePortalAuth,
} from '@/lib/portalAuth'

export function usePortalSession(): {
  session: PortalSession | null
  loading: boolean
  signedIn: boolean
  setSession: (s: PortalSession | null) => void
} {
  const [session, setSession] = useState<PortalSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await getPortalAuthSession()
      if (cancelled) return
      if (s?.clientId) promotePortalGuestToSignedIn()
      setSession(s)
      setLoading(false)
    })()
    const unsub = subscribePortalAuth((s) => {
      if (cancelled) return
      if (s?.clientId) promotePortalGuestToSignedIn()
      setSession(s)
      setLoading(false)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  return {
    session,
    loading,
    signedIn: Boolean(session?.clientId),
    setSession,
  }
}
