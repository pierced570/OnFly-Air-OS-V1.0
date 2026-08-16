/**
 * Explicit sign-in route — magic-link form (also used when /portal has a
 * stale guest track and the home gate would otherwise skip the landing).
 */

import { PortalLanding } from '@/components/PortalLanding'

export default function PortalLoginPage() {
  return <PortalLanding />
}
