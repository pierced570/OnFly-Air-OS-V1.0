/**
 * Register the portal service worker (HTTPS / localhost only).
 * Required for Chromium installability; iOS Add-to-Home-Screen does not need it.
 */
export function registerPortalServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  const host = window.location.hostname
  const okHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    window.location.protocol === 'https:'
  if (!okHost) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal — portal still works; install may fall back to manual.
    })
  })
}
