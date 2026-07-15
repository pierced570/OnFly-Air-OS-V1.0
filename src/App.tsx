import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { DispatchShell } from '@/components/DispatchShell'

const BoardPage = lazy(() => import('@/pages/BoardPage'))
const NetworkPage = lazy(() => import('@/pages/NetworkPage'))
const TripPage = lazy(() => import('@/pages/TripPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))

export function App() {
  return (
    <DispatchShell>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-muted">
            Loading…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<BoardPage />} />
          <Route path="/trips/:id" element={<TripPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </DispatchShell>
  )
}
