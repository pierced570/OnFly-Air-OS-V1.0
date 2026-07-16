import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DispatchShell } from '@/components/DispatchShell'

const BoardPage = lazy(() => import('@/pages/BoardPage'))
const NetworkPage = lazy(() => import('@/pages/NetworkPage'))
const TripPage = lazy(() => import('@/pages/TripPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const AdminTasksPage = lazy(() => import('@/pages/AdminTasksPage'))
const NewTripPage = lazy(() => import('@/pages/NewTripPage'))
const QuotePreviewPage = lazy(() => import('@/pages/QuotePreviewPage'))
const OffersPage = lazy(() => import('@/pages/OffersPage'))
const OfferPublicPage = lazy(() => import('@/pages/OfferPublicPage'))
const AcceptPage = lazy(() => import('@/pages/AcceptPage'))
const OneTapPage = lazy(() => import('@/pages/OneTapPage'))
const PortalHomePage = lazy(() => import('@/pages/portal/PortalHomePage'))
const PortalRequestPage = lazy(() => import('@/pages/portal/PortalRequestPage'))
const PortalTrackPage = lazy(() => import('@/pages/portal/PortalTrackPage'))
const RadarPage = lazy(() => import('@/pages/RadarPage'))
const BriefingPage = lazy(() => import('@/pages/BriefingPage'))
const QuickDispatchPage = lazy(() => import('@/pages/QuickDispatchPage'))
const FinancialsPage = lazy(() => import('@/pages/FinancialsPage'))
const ClientsPage = lazy(() => import('@/pages/ClientsPage'))

function Fallback() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-ink text-muted">
      Loading…
    </div>
  )
}

function isPublic(pathname: string) {
  return (
    pathname.startsWith('/offer/') ||
    pathname.startsWith('/accept/') ||
    pathname.startsWith('/t/') ||
    pathname.startsWith('/portal')
  )
}

export function App() {
  const loc = useLocation()
  const publicRoute = isPublic(loc.pathname)

  const routes = (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/trips/new" element={<NewTripPage />} />
        <Route path="/quick-dispatch" element={<QuickDispatchPage />} />
        <Route path="/financials" element={<FinancialsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/trips/:id/offers" element={<OffersPage />} />
        <Route path="/trips/:id" element={<TripPage />} />
        <Route path="/quotes/preview" element={<QuotePreviewPage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/briefing" element={<BriefingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/tasks" element={<AdminTasksPage />} />
        <Route path="/offer/:token" element={<OfferPublicPage />} />
        <Route path="/accept/:token" element={<AcceptPage />} />
        <Route path="/t/:legToken" element={<OneTapPage />} />
        <Route path="/portal" element={<PortalHomePage />} />
        <Route path="/portal/request" element={<PortalRequestPage />} />
        <Route path="/portal/track/:token" element={<PortalTrackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )

  if (publicRoute) return routes
  return <DispatchShell>{routes}</DispatchShell>
}
