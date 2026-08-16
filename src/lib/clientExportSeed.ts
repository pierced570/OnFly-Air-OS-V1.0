/**
 * Hydrate / enrich Clients directory from the Aug 16 clients-export CSV fixture.
 * Fills contacts, bases, billing, and rules over blank financials stubs.
 * Soft-matches ledger short names (PSA, Kalitta, Athelo Group) to export names.
 */

import csvText from '@/fixtures/clients-export-2026-08-16.csv?raw'
import {
  clientDirectoryNamesMatch,
  profilesFromClientExportCsv,
  type ClientImportDraft,
} from '@/domain/clientExportImport'
import {
  addClient,
  applyClientExportProfile,
  ensureAllClientPortalDomains,
  listClients,
  removeClient,
  type ClientContact,
  type ClientProfile,
} from '@/lib/clientStore'

function isThin(c: ClientProfile): boolean {
  if (!c.contacts.length) return true
  if ((c.notes || '').includes('Seeded from financials')) return true
  return false
}

function draftToContacts(draft: ClientImportDraft): ClientContact[] {
  return draft.contacts.map((c) => ({
    id: crypto.randomUUID(),
    name: c.name,
    email: c.email,
    cell: c.cell,
    role: c.role,
    kind: c.kind,
    title: c.title,
    eta_icaos: c.eta_icaos,
    notify_prefs: { ...c.notify_prefs },
  }))
}

function shouldEnrich(existing: ClientProfile, draft: ClientImportDraft): boolean {
  if (isThin(existing)) return true
  if (draft.contacts.length > existing.contacts.length) return true
  const draftBases = draft.profile.bases?.length ?? 0
  const haveBases = existing.profile.bases?.length ?? 0
  if (draftBases > haveBases) return true
  if (draft.invoice_email && !existing.invoice_email) return true
  // Rename stub → canonical export name even when already enriched under short label
  if (
    existing.name.trim().toLowerCase() !== draft.name.trim().toLowerCase() &&
    isThin(existing)
  ) {
    return true
  }
  return false
}

function findSoftMatch(
  draft: ClientImportDraft,
  directory: ClientProfile[],
): ClientProfile | undefined {
  const exact = directory.find(
    (c) => c.name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
  )
  if (exact) return exact
  // Prefer thin stubs so we enrich the financials row instead of a richer twin
  const soft = directory.filter((c) =>
    clientDirectoryNamesMatch(c.name, draft.name),
  )
  if (!soft.length) return undefined
  soft.sort((a, b) => Number(isThin(b)) - Number(isThin(a)))
  return soft[0]
}

/**
 * Merge export CSV into the directory and persist each changed client.
 * Idempotent: skips clients that already have equal-or-richer data.
 */
export async function ensureClientsExportHydrated(): Promise<{
  created: number
  updated: number
  removed: number
}> {
  const drafts = profilesFromClientExportCsv(csvText)
  let created = 0
  let updated = 0
  let removed = 0

  for (const draft of drafts) {
    const directory = listClients()
    const hit = findSoftMatch(draft, directory)
    if (!hit) {
      addClient({
        name: draft.name,
        email: draft.email,
        invoice_email: draft.invoice_email,
        pay_terms: draft.pay_terms,
        po_prefix: draft.po_prefix,
        notes: draft.notes,
        rules: draft.rules,
        profile: draft.profile,
        contacts: draft.contacts.map((c) => ({
          name: c.name,
          email: c.email,
          cell: c.cell,
          role: c.role,
          kind: c.kind,
          title: c.title,
          eta_icaos: c.eta_icaos,
          notify_prefs: c.notify_prefs,
        })),
      })
      created++
      continue
    }
    if (!shouldEnrich(hit, draft)) continue

    const notes =
      draft.notes ||
      ((hit.notes || '').includes('Seeded from financials') ? '' : hit.notes)

    applyClientExportProfile(hit.id, {
      name: draft.name,
      email: draft.email || hit.email,
      invoice_email: draft.invoice_email || hit.invoice_email,
      pay_terms: draft.pay_terms || hit.pay_terms,
      po_prefix: draft.po_prefix ?? hit.po_prefix,
      notes,
      rules: {
        ...hit.rules,
        ...draft.rules,
      },
      profile: {
        ...hit.profile,
        ...draft.profile,
        source: 'import',
      },
      contacts: draftToContacts(draft),
    })
    updated++
  }

  // Drop leftover thin ledger stubs that soft-match a richer export client
  // (e.g. "PSA" after "PSA Airlines" was created, or duplicate Athelo rows).
  const after = listClients()
  const rich = after.filter((c) => !isThin(c))
  for (const stub of after.filter(isThin)) {
    const twin = rich.find(
      (r) =>
        r.id !== stub.id && clientDirectoryNamesMatch(r.name, stub.name),
    )
    if (!twin) continue
    removeClient(stub.id)
    removed++
  }

  // Every client profile gets portal domains (on-file + manual; PSA → psaairlines.com).
  ensureAllClientPortalDomains()

  return { created, updated, removed }
}
