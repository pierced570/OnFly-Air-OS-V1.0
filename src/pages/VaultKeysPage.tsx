import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  clearVault,
  importVaultCsv,
  listVaultEntries,
  subscribeVault,
  type VaultEntry,
} from '@/lib/vaultStore'
import { getSession, subscribeStaff } from '@/lib/staffStore'

export default function VaultKeysPage() {
  const session = useSyncExternalStore(subscribeStaff, getSession, () => null)
  const entries = useSyncExternalStore(
    subscribeVault,
    listVaultEntries,
    listVaultEntries,
  )
  const [q, setQ] = useState('')
  const [revealId, setRevealId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState<VaultEntry | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((e) =>
      [e.service_name, e.label, e.username, e.notes, e.url]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [entries, q])

  if (!session || (!session.is_admin && !session.sections.includes('vault_keys'))) {
    return (
      <div className="p-6 text-sm text-late">
        Restricted — Logins &amp; keys is not enabled for your account.
      </div>
    )
  }

  async function onFile(file: File | null) {
    if (!file) return
    const text = await file.text()
    const n = importVaultCsv(text, 'replace')
    setStatus(`Imported ${n} rows from ${file.name}`)
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Logins &amp; keys</h1>
        <p className="mt-1 text-sm text-muted">
          Restricted vault for vendor logins and API keys. Stored in this
          browser until a server vault lands — import the CSV after each new
          device. Never put secrets in <span className="avionic">VITE_*</span>.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-muted">
          Search
          <input
            className="mt-1 w-56 rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream outline-none focus:border-gold"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Resend, Supabase…"
          />
        </label>
        <label className="cursor-pointer rounded-md border border-gold/40 px-3 py-2 text-sm text-gold hover:bg-gold/10">
          Import CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-sm text-late"
          onClick={() => {
            if (confirm('Clear all vault rows on this device?')) {
              clearVault()
              setStatus('Vault cleared')
            }
          }}
        >
          Clear
        </button>
        <span className="text-xs text-muted">{entries.length} entries</span>
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {filtered.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between"
              onClick={() => setOpen(e)}
            >
              <div>
                <div className="font-medium text-cream">{e.service_name}</div>
                <div className="text-xs text-muted">{e.label}</div>
              </div>
              <div className="avionic text-xs text-muted">
                {e.username || (e.api_key ? 'api_key' : e.credential_type)}
              </div>
            </button>
          </li>
        ))}
        {!filtered.length && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No rows yet — import <span className="avionic">logins-keys.csv</span>
          </li>
        )}
      </ul>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-surface p-4 sm:rounded-xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-cream">
                  {open.service_name}
                </h2>
                <p className="text-sm text-muted">{open.label}</p>
              </div>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => {
                  setOpen(null)
                  setRevealId(null)
                }}
              >
                Close
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Type" value={open.credential_type} />
              <Row label="Username" value={open.username} mono />
              <SecretRow
                label="Password"
                value={open.password}
                revealed={revealId === `${open.id}-pw`}
                onToggle={() =>
                  setRevealId((id) =>
                    id === `${open.id}-pw` ? null : `${open.id}-pw`,
                  )
                }
              />
              <SecretRow
                label="API key"
                value={open.api_key}
                revealed={revealId === `${open.id}-key`}
                onToggle={() =>
                  setRevealId((id) =>
                    id === `${open.id}-key` ? null : `${open.id}-key`,
                  )
                }
              />
              <Row label="URL" value={open.url} />
              <Row label="Notes" value={open.notes} />
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-cream ${mono ? 'avionic break-all' : 'whitespace-pre-wrap'}`}>
        {value}
      </dd>
    </div>
  )
}

function SecretRow({
  label,
  value,
  revealed,
  onToggle,
}: {
  label: string
  value: string
  revealed: boolean
  onToggle: () => void
}) {
  if (!value) return null
  return (
    <div>
      <dt className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <button type="button" className="text-gold" onClick={onToggle}>
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </dt>
      <dd className="avionic mt-0.5 break-all text-cream">
        {revealed ? value : '••••••••••••'}
      </dd>
    </div>
  )
}
