/**
 * Absolute OnFly wordmark for invoice email headers (dark bar).
 * Prefer VITE_BRAND_LOGO_URL / VITE_APP_URL — never a gated Vercel preview.
 */

import { absoluteAppUrl } from '@/lib/appUrl'
import { BRAND_LOGO_PATH } from '@/domain/brand'

export function invoiceEmailLogoUrl(): string {
  const envLogo = (
    import.meta.env?.VITE_BRAND_LOGO_URL as string | undefined
  )?.trim()
  if (envLogo) return envLogo
  return absoluteAppUrl(BRAND_LOGO_PATH)
}
