import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DispatchShell } from '@/components/DispatchShell'
import { StaffGate } from '@/components/StaffGate'

const BoardPage = lazy(() => import('@/pages/BoardPage'))
const ChatPage = lazy(() => import('@/pages/ChatPage'))
const NetworkPage = lazy(() => import('@/pages/NetworkPage'))
const TripPage = lazy(() => import('@/pages/TripPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const AdminTasksPage = lazy(() => import('@/pages/AdminTasksPage'))
const StaffAccessPage = lazy(() => import('@/pages/StaffAccessPage'))
const VaultKeysPage = lazy(() => import('@/pages/VaultKeysPage'))
const NewTripPage = lazy(() => import('@/pages/NewTripPage'))
const QuotePreviewPage = lazy(() => import('@/pages/QuotePreviewPage'))
const OffersPage = lazy(() => import('@/pages/OffersPage'))
const OfferPublicPage = lazy(() => import('@/pages/OfferPublicPage'))
const AcceptPage = lazy(() => import('@/pages/AcceptPage'))
const OneTapPage = lazy(() => import('@/pages/OneTapPage'))
const PortalHomePage = lazy(() => import('@/pages/portal/PortalHomePage'))
const PortalLoginPage = lazy(() => import('@/pages/portal/PortalLoginPage'))
const PortalRequestPage = lazy(() => import('@/pages/portal/PortalRequestPage'))
const PortalTrackPage = lazy(() => import('@/pages/portal/PortalTrackPage'))
const PortalTripTrackPage = lazy(() =>
  import('@/pages/portal/PortalTrackPage').then((m) => ({
    default: m.PortalTripTrackPage,
  })),
)
const RadarPage = lazy(() => import('@/pages/RadarPage'))
const BriefingPage = lazy(() => import('@/pages/BriefingPage'))
const QuickDispatchPage = lazy(() => import('@/pages/QuickDispatchPage'))
const FinancialsPage = lazy(() => import('@/pages/FinancialsPage'))
const ReferralsPage = lazy(() => import('@/pages/ReferralsPage'))
const ClientsPage = lazy(() => import('@/pages/ClientsPage'))
const LeadsPage = lazy(() => import('@/pages/LeadsPage'))
const FbosPage = lazy(() => import('@/pages/FbosPage'))
const IntakePage = lazy(() => import('@/pages/IntakePage'))
const IntakeReviewPage = lazy(() => import('@/pages/IntakeReviewPage'))
const ManifestPage = lazy(() => import('@/pages/ManifestPage'))
const OnboardPage = lazy(() => import('@/pages/OnboardPage'))
const ClientOnboardPage = lazy(() => import('@/pages/ClientOnboardPage'))
const VendorPacketPage = lazy(() => import('@/pages/VendorPacketPage'))
const ScratchPadPage = lazy(() => import('@/pages/ScratchPadPage'))
const DeskParsePage = lazy(() => import('@/pages/DeskParsePage'))
const OfferPreviewPage = lazy(() => import('@/pages/OfferPreviewPage'))
const StaffLoginPage = lazy(() => import('@/pages/StaffLoginPage'))

function Fallback() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-ink text-muted">
      Loading…
    </div>
  )
}

function isPublic(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/offer/') ||
    pathname.startsWith('/accept/') ||
    pathname.startsWith('/t/') ||
    pathname.startsWith('/portal') ||
    pathname === '/portal/login' ||
    pathname === '/client' ||
    pathname.startsWith('/client/') ||
    pathname === '/onboard' ||
    pathname.startsWith('/onboard/') ||
    pathname === '/vendor' ||
    pathname.startsWith('/vendor/')
  )
}

/** Cream client surfaces — keep <html> theme in sync so tokens aren't dark. */
function isClientThemePath(pathname: string) {
  return (
    pathname.startsWith('/portal') ||
    pathname === '/client' ||
    pathname.startsWith('/client/') ||
    pathname.startsWith('/accept/') ||
    pathname === '/onboard' ||
    pathname.startsWith('/onboard/') ||
    pathname === '/vendor' ||
    pathname.startsWith('/vendor/')
  )
}

export function App() {
  const loc = useLocation()
  const publicRoute = isPublic(loc.pathname)

  useEffect(() => {
    document.documentElement.dataset.theme = isClientThemePath(loc.pathname)
      ? 'client'
      : 'dispatcher'
  }, [loc.pathname])

  const routes = (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/" element={<ScratchPadPage />} />
        <Route path="/login" element={<StaffLoginPage />} />
        <Route path="/desk" element={<DeskParsePage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:tripId" element={<ChatPage />} />
        <Route path="/trips/new" element={<NewTripPage />} />
        <Route path="/quick-dispatch" element={<QuickDispatchPage />} />
        <Route path="/financials" element={<FinancialsPage />} />
        <Route path="/referrals" element={<ReferralsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/fbos" element={<FbosPage />} />
        <Route path="/intake" element={<IntakePage />} />
        <Route path="/intake/:id" element={<IntakeReviewPage />} />
        <Route path="/trips/:id/offers" element={<OffersPage />} />
        <Route path="/trips/:id/manifest" element={<ManifestPage />} />
        <Route path="/trips/:id" element={<TripPage />} />
        <Route path="/quotes/preview" element={<QuotePreviewPage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/briefing" element={<BriefingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/tasks" element={<AdminTasksPage />} />
        <Route path="/admin/staff" element={<StaffAccessPage />} />
        <Route path="/admin/keys" element={<VaultKeysPage />} />
        <Route path="/offer/preview" element={<OfferPreviewPage />} />
        <Route path="/offer/:token" element={<OfferPublicPage />} />
        <Route path="/accept/:token" element={<AcceptPage />} />
        <Route path="/t/:legToken" element={<OneTapPage />} />
        <Route path="/portal" element={<PortalHomePage />} />
        <Route path="/portal/login" element={<PortalLoginPage />} />
        <Route path="/portal/request" element={<PortalRequestPage />} />
        <Route path="/portal/track/:token" element={<PortalTrackPage />} />
        <Route path="/portal/trips/:id" element={<PortalTripTrackPage />} />
        {/* Public client page — send this link; not part of the portal */}
        <Route path="/client" element={<ClientOnboardPage />} />
        <Route path="/client/onboard" element={<Navigate to="/client" replace />} />
        {/* Legacy portal onboard URL */}
        <Route path="/portal/onboard" element={<Navigate to="/client" replace />} />
        <Route path="/onboard" element={<OnboardPage />} />
        <Route path="/vendor" element={<VendorPacketPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )

  if (publicRoute) return routes
  return (
    <StaffGate>
      <DispatchShell>{routes}</DispatchShell>
    </StaffGate>
  )
}
