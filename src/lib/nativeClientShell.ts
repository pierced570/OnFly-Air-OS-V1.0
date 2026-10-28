/**
 * Capacitor / native WebView boot — send cold starts to the client portal.
 * Safe no-op in browser.
 */

export function bootNativeClientShell(): void {
  if (typeof window === 'undefined') return
  try {
    // Avoid importing @capacitor/core in SSR/tests — detect bridge first.
    const cap = (
      window as Window & {
        Capacitor?: { isNativePlatform?: () => boolean }
      }
    ).Capacitor
    if (!cap?.isNativePlatform?.()) return
  } catch {
    return
  }

  const path = window.location.pathname
  if (path === '/' || path === '/index.html') {
    window.location.replace('/portal')
  }
}
