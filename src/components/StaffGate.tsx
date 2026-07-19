import { Suspense, lazy, useSyncExternalStore, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { sectionForPath } from '@/domain/staffAccess'
import {
  getSession,
  sessionCan,
  subscribeStaff,
} from '@/lib/staffStore'

const StaffLoginPage = lazy(() => import('@/pages/StaffLoginPage'))

export function StaffGate({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeStaff, getSession, getSession)
  const loc = useLocation()

  if (!session) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-ink text-muted">
            Loading…
          </div>
        }
      >
        <StaffLoginPage />
      </Suspense>
    )
  }

  const section = sectionForPath(loc.pathname)
  if (section && !sessionCan(section)) {
    return <Navigate to="/" replace />
  }

  return children
}
