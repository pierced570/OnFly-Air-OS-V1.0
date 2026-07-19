/**
 * Load QBO dashboard stats (or mock) for Financials page.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  createAccountingAdapter,
  type QbConnectionStatus,
  type QbDashboardStats,
} from '@/adapters/accounting'

export function useQuickBooksDashboard() {
  const [stats, setStats] = useState<QbDashboardStats | null>(null)
  const [connection, setConnection] = useState<QbConnectionStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const acct = createAccountingAdapter()
      const [c, s] = await Promise.all([
        acct.getConnectionStatus(),
        acct.getDashboardStats(),
      ])
      setConnection(c)
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 5 * 60_000)
    return () => window.clearInterval(id)
  }, [refresh])

  async function connect() {
    const acct = createAccountingAdapter()
    const url = await acct.getConnectUrl(
      `${window.location.origin}/financials`,
    )
    if (!url) {
      setError(
        'QuickBooks connect unavailable — set QB_CLIENT_ID/SECRET on Supabase and VITE_QB_ADAPTER=real',
      )
      return
    }
    window.location.href = url
  }

  return { stats, connection, busy, error, refresh, connect }
}
