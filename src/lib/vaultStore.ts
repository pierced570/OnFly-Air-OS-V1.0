/**
 * Logins & keys vault — session/local persistence.
 * Primary name is `label` (service_name kept only for CSV import compat).
 */

export type VaultCredentialType = 'login' | 'api_key' | 'both'

export type VaultEntry = {
  id: string
  /** Display name — the only name users enter */
  label: string
  /** Legacy CSV column; mirrored from label on save */
  service_name: string
  credential_type: VaultCredentialType | string
  username: string
  password: string
  api_key: string
  url: string
  notes: string
  created_at: string
}

const VAULT_KEY = 'onfly.vault.keys.v1'

let entries: VaultEntry[] = load()
const listeners = new Set<() => void>()

function bump() {
  for (const l of listeners) l()
}

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined'
}

function load(): VaultEntry[] {
  if (!storageAvailable()) return []
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as VaultEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeEntry)
  } catch {
    return []
  }
}

function normalizeEntry(e: VaultEntry): VaultEntry {
  const label = (e.label || e.service_name || '').trim()
  return {
    ...e,
    label,
    service_name: label,
    credential_type: e.credential_type || 'login',
    username: e.username ?? '',
    password: e.password ?? '',
    api_key: e.api_key ?? '',
    url: e.url ?? '',
    notes: e.notes ?? '',
    created_at: e.created_at || new Date().toISOString(),
  }
}

function persist() {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(entries))
  } catch {
    /* ignore */
  }
}

export function displayVaultLabel(e: Pick<VaultEntry, 'label' | 'service_name'>): string {
  return (e.label || e.service_name || 'Untitled').trim()
}

export function subscribeVault(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listVaultEntries(): VaultEntry[] {
  return entries.map((e) => ({ ...e }))
}

export function clearVault(): void {
  entries = []
  persist()
  bump()
}

export function deleteVaultEntry(id: string): void {
  entries = entries.filter((e) => e.id !== id)
  persist()
  bump()
}

/** Parse the OnFly logins-keys CSV format into vault rows. */
export function parseVaultCsv(text: string): VaultEntry[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((h) => h.trim())
  const out: VaultEntry[] = []
  let i = 1
  while (i < lines.length) {
    let line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    while ((line.match(/"/g) ?? []).length % 2 === 1 && i + 1 < lines.length) {
      i++
      line += '\n' + lines[i]
    }
    const cols = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? ''
    })
    const label = (row.label || row.service_name || '').trim()
    const typeRaw = (row.credential_type || '').trim().toLowerCase()
    const credential_type: VaultCredentialType =
      typeRaw === 'api_key' || typeRaw === 'both' || typeRaw === 'login'
        ? typeRaw
        : row.api_key && !row.username && !row.password
          ? 'api_key'
          : row.api_key
            ? 'both'
            : 'login'
    out.push(
      normalizeEntry({
        id: crypto.randomUUID(),
        service_name: label,
        label,
        credential_type,
        username: row.username ?? '',
        password: row.password ?? '',
        api_key: row.api_key ?? '',
        url: row.url ?? '',
        notes: row.notes ?? '',
        created_at: row.created_at || new Date().toISOString(),
      }),
    )
    i++
  }
  return out.filter((e) => e.label || e.api_key || e.username)
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQ = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      result.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  result.push(cur)
  return result
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function exportVaultCsv(): string {
  const headers = [
    'service_name',
    'label',
    'credential_type',
    'username',
    'password',
    'api_key',
    'url',
    'notes',
    'created_at',
  ]
  const lines = [headers.join(',')]
  for (const e of entries) {
    const label = displayVaultLabel(e)
    lines.push(
      [
        label,
        label,
        e.credential_type,
        e.username,
        e.password,
        e.api_key,
        e.url,
        e.notes,
        e.created_at,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}

export function importVaultCsv(
  text: string,
  mode: 'replace' | 'merge' = 'replace',
): number {
  const parsed = parseVaultCsv(text)
  if (mode === 'replace') {
    entries = parsed
  } else {
    const key = (e: VaultEntry) => displayVaultLabel(e).toLowerCase()
    const map = new Map(entries.map((e) => [key(e), e]))
    for (const e of parsed) {
      const existing = map.get(key(e))
      map.set(key(e), existing ? { ...e, id: existing.id } : e)
    }
    entries = [...map.values()]
  }
  persist()
  bump()
  return parsed.length
}

export function upsertVaultEntry(
  partial: Partial<VaultEntry> & { label: string },
): VaultEntry {
  const label = partial.label.trim()
  if (!label) throw new Error('Label required')
  const id = partial.id ?? crypto.randomUUID()
  const next = normalizeEntry({
    id,
    label,
    service_name: label,
    credential_type: partial.credential_type ?? 'login',
    username: partial.username ?? '',
    password: partial.password ?? '',
    api_key: partial.api_key ?? '',
    url: partial.url ?? '',
    notes: partial.notes ?? '',
    created_at: partial.created_at ?? new Date().toISOString(),
  })
  const idx = entries.findIndex((e) => e.id === id)
  if (idx >= 0) {
    next.created_at = entries[idx].created_at
    entries[idx] = next
  } else {
    const dup = entries.findIndex(
      (e) => displayVaultLabel(e).toLowerCase() === label.toLowerCase(),
    )
    if (dup >= 0) {
      next.id = entries[dup].id
      next.created_at = entries[dup].created_at
      entries[dup] = next
    } else {
      entries.push(next)
    }
  }
  persist()
  bump()
  return { ...next }
}
