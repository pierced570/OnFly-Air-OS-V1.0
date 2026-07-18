import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  listNeedsInfoTasks,
  openCountByEntity,
  resolveNeedsInfoTask,
  subscribeNeedsInfo,
} from '@/lib/needsInfoStore'

export default function AdminTasksPage() {
  const tasks = useSyncExternalStore(subscribeNeedsInfo, listNeedsInfoTasks, () => [])
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [entity, setEntity] = useState<string>('all')
  const counts = openCountByEntity()

  const visible = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === 'open' && t.status !== 'open') return false
      if (entity !== 'all' && t.entity_type !== entity) return false
      return true
    })
  }, [tasks, filter, entity])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const t of visible) {
      const key = `${t.entity_type}:${t.entity_label}`
      const list = map.get(key) ?? []
      list.push(t)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [visible])

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cream">NEEDS-INFO tasks</h1>
          <p className="mt-1 text-sm text-muted">
            Daily data-collection queue — resolve opens the matching wizard.
          </p>
        </div>
        <Link to="/admin" className="text-sm text-gold hover:text-gold-lt">
          ← Admin wizards
        </Link>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} className="rounded-md border border-border px-2 py-1 text-muted">
            {k}: <span className="avionic text-cream">{n}</span> open
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={filter === 'open' ? 'rounded bg-gold px-3 py-1 text-sm text-ink' : 'rounded bg-surface px-3 py-1 text-sm text-muted'}
          onClick={() => setFilter('open')}
        >
          Open
        </button>
        <button
          type="button"
          className={filter === 'all' ? 'rounded bg-gold px-3 py-1 text-sm text-ink' : 'rounded bg-surface px-3 py-1 text-sm text-muted'}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <select
          className="rounded border border-border bg-ink px-2 py-1 text-sm text-cream"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        >
          <option value="all">All entities</option>
          <option value="operator">Operators</option>
          <option value="aircraft">Aircraft</option>
          <option value="client">Clients</option>
          <option value="fbo">FBOs</option>
          <option value="trip">Trips</option>
        </select>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted">No tasks match.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, list]) => (
            <section key={key} className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-cream">{list[0]!.entity_label}</h2>
              <p className="text-xs uppercase tracking-wider text-gold">{list[0]!.entity_type}</p>
              <ul className="mt-3 space-y-2">
                {list.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-start justify-between gap-3 border-t border-border/40 pt-2"
                  >
                    <div>
                      <div className="text-cream">{t.field}</div>
                      <div className="text-sm text-muted">{t.note}</div>
                      <div className="avionic text-[11px] text-muted">{t.status}</div>
                    </div>
                    <div className="flex gap-2">
                      {t.wizard && t.status === 'open' && (
                        <Link
                          to={`/admin?wizard=${t.wizard}`}
                          className="text-xs text-gold hover:text-gold-lt"
                        >
                          Open wizard
                        </Link>
                      )}
                      {t.status === 'open' && (
                        <button
                          type="button"
                          className="text-xs text-onplan"
                          onClick={() => resolveNeedsInfoTask(t.id)}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
