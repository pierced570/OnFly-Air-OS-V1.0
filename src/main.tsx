import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './App'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
)

/** Defer DB hydrate so first paint isn't blocked by the operating-data graph. */
function scheduleHydrate() {
  const run = () => {
    void import('@/lib/db/hydrate').then((m) =>
      m.hydrateOperatingData().then(async (r) => {
        if (r.ok) {
          console.info(
            `[onfly] hydrated — clients ${r.clients}, fbos ${r.fbos}, tasks ${r.tasks}, leads ${r.leads}, trips ${r.trips}`,
          )
        }
        // Offline / empty DB: restore historical clients from financials fixture.
        if (!r.clients) {
          const { ensureClientsSeeded } = await import('@/lib/clientStore')
          const n = await ensureClientsSeeded()
          if (n) console.info(`[onfly] seeded ${n} clients from financials fixture`)
        }
      }),
    )
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 2500 })
  } else {
    setTimeout(run, 50)
  }
}

scheduleHydrate()

// Also schedule a light fixture fallback if hydrate never runs (no Supabase).
void import('@/lib/clientStore').then((m) => m.scheduleClientsFixtureSeed())
