import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './App'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { initAppearance } from '@/lib/appearanceStore'

initAppearance()

/** Staff roster must load before login — do not defer behind idle hydrate. */
void import('@/lib/staffStore').then((m) => {
  void m.ensureStaffHydrated()
})

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
          const { ensureClientsDirectorySeeded } = await import(
            '@/lib/clientStore'
          )
          const n = await ensureClientsDirectorySeeded()
          if (n) console.info(`[onfly] seeded ${n} clients from financials fixture`)
        }
        // Always enrich blanks with the clients-export CSV (contacts, bases, rules).
        const { ensureClientsExportHydrated } = await import(
          '@/lib/clientExportSeed'
        )
        const en = await ensureClientsExportHydrated()
        if (en.created || en.updated) {
          console.info(
            `[onfly] clients export — created ${en.created}, enriched ${en.updated}, removed ${en.removed}`,
          )
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
