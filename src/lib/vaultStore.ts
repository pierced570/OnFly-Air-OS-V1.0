/**
 * Logins & keys vault — session/local persistence.
 * Never commit CSV contents; import via Admin → Logins & keys.
 */

export type VaultEntry = {
  id: string
  service_name: string
  label: string
  credential_type: string
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
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
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
    // Merge quoted multiline fields
    while ((line.match(/"/g) ?? []).length % 2 === 1 && i + 1 < lines.length) {
      i++
      line += '\n' + lines[i]
    }
    const cols = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? ''
    })
    out.push({
      id: crypto.randomUUID(),
      service_name: row.service_name ?? '',
      label: row.label ?? '',
      credential_type: row.credential_type ?? '',
      username: row.username ?? '',
      password: row.password ?? '',
      api_key: row.api_key ?? '',
      url: row.url ?? '',
      notes: row.notes ?? '',
      created_at: row.created_at || new Date().toISOString(),
    })
    i++
  }
  return out.filter((e) => e.service_name || e.label || e.api_key)
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

export function importVaultCsv(
  text: string,
  mode: 'replace' | 'merge' = 'replace',
): number {
  const parsed = parseVaultCsv(text)
  if (mode === 'replace') {
    entries = parsed
  } else {
    const key = (e: VaultEntry) =>
      `${e.service_name}::${e.label}`.toLowerCase()
    const map = new Map(entries.map((e) => [key(e), e]))
    for (const e of parsed) {
      map.set(key(e), e)
    }
    entries = [...map.values()]
  }
  persist()
  bump()
  return parsed.length
}

export function upsertVaultEntry(
  partial: Partial<VaultEntry> & { service_name: string; label: string },
): VaultEntry {
  const id = partial.id ?? crypto.randomUUID()
  const next: VaultEntry = {
    id,
    service_name: partial.service_name,
    label: partial.label,
    credential_type: partial.credential_type ?? '',
    username: partial.username ?? '',
    password: partial.password ?? '',
    api_key: partial.api_key ?? '',
    url: partial.url ?? '',
    notes: partial.notes ?? '',
    created_at: partial.created_at ?? new Date().toISOString(),
  }
  const idx = entries.findIndex((e) => e.id === id)
  if (idx >= 0) entries[idx] = next
  else {
    const dup = entries.findIndex(
      (e) =>
        e.service_name === next.service_name && e.label === next.label,
    )
    if (dup >= 0) entries[dup] = { ...next, id: entries[dup].id }
    else entries.push(next)
  }
  persist()
  bump()
  return { ...next }
}
