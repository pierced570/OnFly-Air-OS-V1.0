/* OnFly client PWA — installability shell. Network-first; no offline rewrite. */
const CACHE = 'onfly-portal-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then(() => undefined))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // Never cache API / auth / edge traffic.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.includes('supabase') ||
    url.pathname.startsWith('/functions')
  ) {
    return
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.pathname === '/' || url.pathname.endsWith('.webmanifest') || url.pathname.startsWith('/brand/'))) {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  )
})
