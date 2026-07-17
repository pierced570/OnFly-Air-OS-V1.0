import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './App'
import { hydrateOperatingData } from '@/lib/db/hydrate'

void hydrateOperatingData().then((r) => {
  if (r.ok) {
    console.info(
      `[onfly] hydrated operating data — clients ${r.clients}, fbos ${r.fbos}, tasks ${r.tasks}`,
    )
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
