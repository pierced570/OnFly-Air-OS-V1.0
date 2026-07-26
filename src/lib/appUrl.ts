/**
 * Canonical public origin for SMS/email links operators and clients open.
 * Always prefer VITE_APP_URL (production) — never send a Vercel preview /
 * Deployment-Protection URL, which lands outsiders on a Vercel sign-in page.
 */

export function appPublicUrl(): string {
  const raw = (import.meta.env.VITE_APP_URL as string | undefined)?.trim()
  if (raw) return raw.replace(/\/$/, '')

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '')
    // Preview deployments are often auth-gated — warn so dispatch notices.
    if (/\.vercel\.app$/i.test(origin) || /vercel\.com/i.test(origin)) {
      console.warn(
        '[onfly] VITE_APP_URL is unset — outbound links use this origin and may hit Vercel Deployment Protection. Set VITE_APP_URL to your public production URL.',
      )
    }
    return origin
  }
  return ''
}

export function absoluteAppUrl(path: string): string {
  const base = appPublicUrl()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}
