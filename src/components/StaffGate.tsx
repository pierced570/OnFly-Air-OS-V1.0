import { useSyncExternalStore, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { sectionForPath } from '@/domain/staffAccess'
import {
  getSession,
  sessionCan,
  subscribeStaff,
} from '@/lib/staffStore'
import StaffLoginPage from '@/pages/StaffLoginPage'

export function StaffGate({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeStaff, getSession, () => null)
  const loc = useLocation()

  if (!session) {
    return <StaffLoginPage />
  }

  const section = sectionForPath(loc.pathname)
  if (section && !sessionCan(section)) {
    return <Navigate to="/" replace />
  }

  return children
}
