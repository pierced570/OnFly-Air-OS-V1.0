import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  clearVault,
  deleteVaultEntry,
  displayVaultLabel,
  exportVaultCsv,
  hasLocalVaultSeed,
  importVaultCsv,
  listVaultEntries,
  restoreVaultFromLocalSeed,
  subscribeVault,
  upsertVaultEntry,
  type VaultCredentialType,
  type VaultEntry,
} from '@/lib/vaultStore'
import { getSession, subscribeStaff } from '@/lib/staffStore'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const labelCls = 'block text-xs text-muted'

export default function VaultKeysPage() {
  // getServerSnapshot must match getSnapshot identity rules (no () => null).
  const session = useSyncExternalStore(subscribeStaff, getSession, getSession)
  const entries = useSyncExternalStore(
    subscribeVault,
    listVaultEntries,
    listVaultEntries,
  )
  const [q, setQ] = useState('')
  const [revealId, setRevealId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [editor, setEditor] = useState<Partial<VaultEntry> | null>(null)
  const [viewing, setViewing] = useState<VaultEntry | null>(null)
  const [replaceOnImport, setReplaceOnImport] = useState(false)

  // Empty vault + local seed file → restore once (browser localStorage wipe recovery)
  useEffect(() => {
    if (entries.length > 0) return
    if (!hasLocalVaultSeed()) return
    const n = restoreVaultFromLocalSeed()
    if (n > 0) {
      setStatus(`Restored ${n} credentials from local seed`)
    }
  }, [entries.length])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((e) =>
      [displayVaultLabel(e), e.username, e.notes, e.url, e.credential_type]
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
    if (replaceOnImport) {
      const ok = confirm(
        `Replace all ${entries.length} vault rows with this CSV? This cannot be undone.`,
      )
      if (!ok) return
    }
    const n = importVaultCsv(text, replaceOnImport ? 'replace' : 'merge')
    setStatus(
      replaceOnImport
        ? `Replaced vault with ${n} rows from ${file.name}`
        : `Merged ${n} rows from ${file.name}`,
    )
  }

  function downloadCsv() {
    const blob = new Blob([exportVaultCsv()], {
      type: 'text/csv;charset=utf-8',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `onfly-logins-keys-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function onRestoreSeed() {
    const n = restoreVaultFromLocalSeed()
    setStatus(
      n > 0
        ? `Restored ${n} credentials from local seed`
        : hasLocalVaultSeed()
          ? 'Seed already loaded (no new rows)'
          : 'No local seed in this build — Import CSV from data/private/logins-keys.csv',
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-cream">
            Logins &amp; API Keys
          </h1>
          <p className="mt-1 text-sm text-muted">
            Restricted vault. One label per credential — no separate service
            name. Stored in this browser (localStorage) — export CSV after
            edits so you can restore on another device or after a wipe.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={downloadCsv}
            className="min-h-11 rounded-md border border-border px-3 py-2.5 text-sm text-cream hover:border-gold sm:min-h-0 sm:py-2"
          >
            Export CSV
          </button>
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border px-3 py-2.5 text-sm text-cream hover:border-gold sm:min-h-0 sm:py-2">
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
            className="min-h-11 rounded-md bg-gold px-3 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt sm:min-h-0 sm:py-2"
            onClick={() =>
              setEditor({
                label: '',
                credential_type: 'api_key',
                url: '',
                username: '',
                password: '',
                api_key: '',
                notes: '',
              })
            }
          >
            + Add Credential
          </button>
        </div>
      </header>

      {entries.length === 0 && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm text-cream">
          <p className="font-medium text-gold">Vault is empty on this device</p>
          <p className="mt-1 text-muted">
            Keys are not stored on the server yet — they live in this browser
            only. Import{' '}
            <span className="avionic text-cream">data/private/logins-keys.csv</span>{' '}
            (merge) to restore the full set.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink">
              Import logins-keys.csv
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {hasLocalVaultSeed() && (
              <button
                type="button"
                className="rounded-md border border-gold/50 px-3 py-2 text-sm text-gold"
                onClick={onRestoreSeed}
              >
                Restore local seed
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className={`${labelCls} w-full min-w-0 flex-1`}>
          Search
          <input
            className={field}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Supabase, Resend…"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={replaceOnImport}
            onChange={(e) => setReplaceOnImport(e.target.checked)}
          />
          Replace on import (default is merge)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {hasLocalVaultSeed() && (
            <button
              type="button"
              className="min-h-10 rounded-md border border-border px-3 py-2 text-sm text-cream"
              onClick={onRestoreSeed}
            >
              Restore seed
            </button>
          )}
          <button
            type="button"
            className="min-h-10 rounded-md border border-border px-3 py-2 text-sm text-late"
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
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {filtered.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setViewing(e)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={e.credential_type} />
                <span className="font-medium text-cream">
                  {displayVaultLabel(e)}
                </span>
              </div>
              <div className="avionic mt-1 text-xs text-muted">
                {e.username ||
                  (e.api_key ? '••••••••' : e.url || e.credential_type)}
              </div>
            </button>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="min-h-11 rounded-md border border-border px-2.5 py-2 text-xs text-cream hover:border-gold"
                onClick={() => setEditor(e)}
              >
                Edit
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-border px-2.5 py-2 text-xs text-late hover:border-late"
                onClick={() => {
                  if (confirm(`Delete ${displayVaultLabel(e)}?`)) {
                    deleteVaultEntry(e.id)
                    setStatus(`Deleted ${displayVaultLabel(e)}`)
                  }
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {!filtered.length && entries.length > 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No matches for “{q}”
          </li>
        )}
        {!filtered.length && entries.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No credentials yet — import CSV above
          </li>
        )}
      </ul>

      {editor && (
        <CredentialForm
          initial={editor}
          onClose={() => setEditor(null)}
          onSave={(input) => {
            upsertVaultEntry(input)
            setEditor(null)
            setStatus(`Saved ${input.label}`)
          }}
        />
      )}

      {viewing && (
        <ViewCredential
          entry={viewing}
          revealId={revealId}
          setRevealId={setRevealId}
          onClose={() => {
            setViewing(null)
            setRevealId(null)
          }}
          onEdit={() => {
            setEditor(viewing)
            setViewing(null)
          }}
        />
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const t = type === 'api_key' ? 'API Key' : type === 'both' ? 'Both' : 'Login'
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
      {t}
    </span>
  )
}

function CredentialForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<VaultEntry>
  onClose: () => void
  onSave: (input: {
    id?: string
    label: string
    credential_type: VaultCredentialType
    username: string
    password: string
    api_key: string
    url: string
    notes: string
  }) => void
}) {
  const [type, setType] = useState<VaultCredentialType>(
    (initial.credential_type as VaultCredentialType) || 'api_key',
  )
  const [label, setLabel] = useState(initial.label ?? '')
  const [url, setUrl] = useState(initial.url ?? '')
  const [username, setUsername] = useState(initial.username ?? '')
  const [password, setPassword] = useState(initial.password ?? '')
  const [apiKey, setApiKey] = useState(initial.api_key ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const showLogin = type === 'login' || type === 'both'
  const showKey = type === 'api_key' || type === 'both'

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) {
      setError('Label is required')
      return
    }
    onSave({
      id: initial.id,
      label: label.trim(),
      credential_type: type,
      username: showLogin ? username.trim() : '',
      password: showLogin ? password : '',
      api_key: showKey ? apiKey.trim() : '',
      url: url.trim(),
      notes: notes.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6">
      <form
        onSubmit={submit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-surface sm:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-cream">
            {initial.id ? 'Edit Credential' : 'Add Credential'}
          </h2>
          <button
            type="button"
            className="text-muted hover:text-cream"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-4">
          <label className={labelCls}>
            Type
            <select
              className={field}
              value={type}
              onChange={(e) => setType(e.target.value as VaultCredentialType)}
            >
              <option value="api_key">API Key</option>
              <option value="login">Login</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label className={labelCls}>
            Label *
            <input
              className={field}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Supabase"
              required
              autoFocus
            />
          </label>

          <label className={labelCls}>
            URL
            <input
              className={field}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </label>

          {showLogin && (
            <>
              <label className={labelCls}>
                Username
                <input
                  className={`${field} font-mono`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className={labelCls}>
                Password
                <input
                  type="password"
                  className={`${field} font-mono`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}

          {showKey && (
            <label className={labelCls}>
              API Key / Token
              <input
                className={`${field} font-mono`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}

          <label className={labelCls}>
            Notes
            <textarea
              className={field}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-late">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-cream px-4 py-2 text-sm font-medium text-ink hover:bg-cream/90"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

function ViewCredential({
  entry,
  revealId,
  setRevealId,
  onClose,
  onEdit,
}: {
  entry: VaultEntry
  revealId: string | null
  setRevealId: (id: string | null) => void
  onClose: () => void
  onEdit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-surface p-4 sm:rounded-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1">
              <TypeBadge type={entry.credential_type} />
            </div>
            <h2 className="text-lg font-semibold text-cream">
              {displayVaultLabel(entry)}
            </h2>
          </div>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="URL" value={entry.url} />
          <Row label="Username" value={entry.username} mono />
          <SecretRow
            label="Password"
            value={entry.password}
            revealed={revealId === `${entry.id}-pw`}
            onToggle={() =>
              setRevealId(
                revealId === `${entry.id}-pw` ? null : `${entry.id}-pw`,
              )
            }
          />
          <SecretRow
            label="API key"
            value={entry.api_key}
            revealed={revealId === `${entry.id}-key`}
            onToggle={() =>
              setRevealId(
                revealId === `${entry.id}-key` ? null : `${entry.id}-key`,
              )
            }
          />
          <Row label="Notes" value={entry.notes} />
        </dl>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-ink"
            onClick={onEdit}
          >
            Edit
          </button>
        </div>
      </div>
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
      <dd
        className={`mt-0.5 text-cream ${mono ? 'avionic break-all' : 'whitespace-pre-wrap'}`}
      >
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
