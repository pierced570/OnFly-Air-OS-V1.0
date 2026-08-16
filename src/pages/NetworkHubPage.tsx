/**
 * Network hub — vertical tabs for operators, recommend, radar, FBOs, couriers.
 */

import { Suspense, lazy, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  NETWORK_HUB_TABS,
  parseNetworkHubTab,
  type NetworkHubTabId,
} from '@/domain/networkHub'
import { OperatorInvitePanel } from '@/components/OperatorInvitePanel'
import { GroundCouriersPanel } from '@/pages/network/GroundCouriersPanel'
import { LocationRecommendPanel } from '@/pages/network/LocationRecommendPanel'

const NetworkPage = lazy(() => import('@/pages/NetworkPage'))
const RadarPage = lazy(() => import('@/pages/RadarPage'))
const FbosPage = lazy(() => import('@/pages/FbosPage'))

function TabBody({ tab }: { tab: NetworkHubTabId }) {
  switch (tab) {
    case 'invite':
      return <OperatorInvitePanel />
    case 'operators':
      return <NetworkPage embedded />
    case 'recommend':
      return <LocationRecommendPanel />
    case 'radar':
      return <RadarPage embedded />
    case 'fbos':
      return <FbosPage embedded />
    case 'couriers':
      return <GroundCouriersPanel />
  }
}

export default function NetworkHubPage() {
  const [params, setParams] = useSearchParams()
  const tab = parseNetworkHubTab(params.get('tab'))

  useEffect(() => {
    const raw = params.get('tab')
    if (!raw) {
      setParams({ tab: 'invite' }, { replace: true })
      return
    }
    // Normalize legacy ?tab=matrix bookmarks to recommend.
    if (raw.trim().toLowerCase() === 'matrix') {
      setParams({ tab: 'recommend' }, { replace: true })
    }
  }, [params, setParams])

  function select(id: NetworkHubTabId) {
    setParams({ tab: id }, { replace: true })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="shrink-0 border-b border-border bg-surface md:w-52 md:border-b-0 md:border-r">
        <div className="px-4 py-4 md:px-3 md:pt-6">
          <h1 className="text-lg font-semibold text-cream md:text-xl">
            Network
          </h1>
          <p className="mt-1 text-xs text-muted">
            Operators, recommended calls, radar, FBOs, ground
          </p>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-2 md:pb-4"
          aria-label="Network sections"
        >
          {NETWORK_HUB_TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t.id)}
                className={[
                  'shrink-0 rounded-md px-3 py-2.5 text-left transition-colors md:w-full',
                  active
                    ? 'bg-gold/15 text-gold'
                    : 'text-muted hover:bg-surface-2 hover:text-cream',
                ].join(' ')}
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="mt-0.5 hidden text-[11px] text-muted md:block">
                  {t.blurb}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Suspense
          fallback={<p className="text-sm text-muted">Loading…</p>}
        >
          <TabBody tab={tab} />
        </Suspense>
      </main>
    </div>
  )
}
