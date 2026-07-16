import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DispatchShell } from '@/components/DispatchShell'

const BoardPage = lazy(() => import('@/pages/BoardPage'))
const NetworkPage = lazy(() => import('@/pages/NetworkPage'))
const TripPage = lazy(() => import('@/pages/TripPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const NewTripPage = lazy(() => import('@/pages/NewTripPage'))
const QuotePreviewPage = lazy(() => import('@/pages/QuotePreviewPage'))
const OffersPage = lazy(() => import('@/pages/OffersPage'))
const OfferPublicPage = lazy(() => import('@/pages/OfferPublicPage'))
const AcceptPage = lazy(() => import('@/pages/AcceptPage'))

function Fallback() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-ink text-muted">
      Loading…
    </div>
  )
}

export function App() {
  const loc = useLocation()
  const publicRoute = loc.pathname.startsWith('/offer/') || loc.pathname.startsWith('/accept/')

  const routes = (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/trips/new" element={<NewTripPage />} />
        <Route path="/trips/:id/offers" element={<OffersPage />} />
        <Route path="/trips/:id" element={<TripPage />} />
        <Route path="/quotes/preview" element={<QuotePreviewPage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/offer/:token" element={<OfferPublicPage />} />
        <Route path="/accept/:token" element={<AcceptPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )

  if (publicRoute) return routes
  return <DispatchShell>{routes}</DispatchShell>
}
