/**
 * Legacy /portal/login → single-page portal landing (magic link lives there).
 */

import { Navigate } from 'react-router-dom'

export default function PortalLoginPage() {
  return <Navigate to="/portal" replace />
}
