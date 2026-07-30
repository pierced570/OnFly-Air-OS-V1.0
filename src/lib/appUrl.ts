/**
 * Canonical public origin for SMS/email links operators and clients open.
 * Always prefer VITE_APP_URL (production) — never send a Vercel preview /
 * Deployment-Protection URL, which lands outsiders on a Vercel sign-in page.
 */

/**
 * Production SPA on the live custom domain (Vercel).
 * `app.onflyair.com` is not DNS-published — do not use it for client/operator links.
 */
export const DEFAULT_APP_PUBLIC_URL = 'https://ofaops.onflyair.com'

export function isGatedDeployOrigin(origin: string): boolean {
  const o = origin.trim().replace(/\/$/, '')
  try {
    const host = new URL(o.includes('://') ? o : `https://${o}`).hostname
    return (
      /\.vercel\.app$/i.test(host) ||
      /(^|\.)vercel\.com$/i.test(host)
    )
  } catch {
    return /\.vercel\.app$/i.test(o) || /vercel\.com/i.test(o)
  }
}

export function appPublicUrl(): string {
  const raw = (import.meta.env.VITE_APP_URL as string | undefined)?.trim()
  if (raw) {
    const cleaned = raw.replace(/\/$/, '')
    if (isGatedDeployOrigin(cleaned)) {
      console.warn(
        '[onfly] VITE_APP_URL points at a Vercel deploy URL — using',
        DEFAULT_APP_PUBLIC_URL,
        'for outbound client/operator links.',
      )
      return DEFAULT_APP_PUBLIC_URL
    }
    return cleaned
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '')
    if (isGatedDeployOrigin(origin)) {
      console.warn(
        '[onfly] VITE_APP_URL is unset and this origin is a Vercel deploy — outbound links use',
        DEFAULT_APP_PUBLIC_URL,
        '(set VITE_APP_URL to your public production URL).',
      )
      return DEFAULT_APP_PUBLIC_URL
    }
    return origin
  }
  return DEFAULT_APP_PUBLIC_URL
}

export function absoluteAppUrl(path: string): string {
  const base = appPublicUrl()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
