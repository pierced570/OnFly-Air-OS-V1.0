import { useEffect, useState, useSyncExternalStore } from 'react'
import PhoneInput from '@/components/PhoneInput'
import {
  formatPhoneDisplay,
  GRANTABLE_SECTION_IDS,
  GRANTABLE_SECTIONS,
  OWNER_STAFF_ID,
  STAFF_SECTIONS,
  type StaffMember,
  type StaffSectionId,
} from '@/domain/staffAccess'
import {
  getSession,
  getStaffSyncStatus,
  listStaff,
  refreshStaffFromDb,
  removeStaff,
  subscribeStaff,
  upsertStaff,
} from '@/lib/staffStore'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'

export default function StaffAccessPage() {
  const staff = useSyncExternalStore(subscribeStaff, listStaff, listStaff)
  const session = useSyncExternalStore(subscribeStaff, getSession, getSession)
  const sync = useSyncExternalStore(
    subscribeStaff,
    getStaffSyncStatus,
    getStaffSyncStatus,
  )
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void refreshStaffFromDb()
  }, [])

  if (!session?.is_admin) {
    return (
      <div className="p-6 text-sm text-late">
        Owner only — Staff access is limited to Pierce&apos;s account.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Staff access</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;re the only owner with full access. Set each person&apos;s
          phone so they can log in, then toggle exactly which sections they can
          see. Phones and grants sync to Supabase so they survive deploys.
          Nobody else can open this page or change grants.
        </p>
      </header>

      {sync.message ? (
        <aside
          className={[
            'rounded-lg border px-3 py-2 text-xs',
            sync.ok === false
              ? 'border-[color:var(--red)]/40 bg-[color:var(--red)]/10 text-late'
              : 'border-gold/30 bg-gold/10 text-cream/85',
          ].join(' ')}
        >
          {sync.message}
        </aside>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-ink hover:bg-gold-lt"
          onClick={() =>
            setEditing({
              id: '',
              name: '',
              phone: '',
              is_admin: false,
              sections: ['board'],
              active: true,
            })
          }
        >
          Add person
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-cream hover:border-gold"
          onClick={() => {
            void refreshStaffFromDb().then(() =>
              setStatus('Refreshed roster from cloud'),
            )
          }}
        >
          Refresh from cloud
        </button>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {staff.map((s) => {
          const isOwner = s.id === OWNER_STAFF_ID
          return (
            <li
              key={s.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="font-medium text-cream">
                  {s.name}
                  {isOwner && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                      owner
                    </span>
                  )}
                  {!s.active && (
                    <span className="ml-2 text-[10px] uppercase text-late">
                      inactive
                    </span>
                  )}
                </div>
                <div className="avionic text-xs text-muted">
                  {s.phone
                    ? formatPhoneDisplay(s.phone)
                    : 'phone not set — cannot log in'}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {isOwner
                    ? 'All sections (cannot be limited)'
                    : s.sections.length
                      ? s.sections
                          .map(
                            (id) =>
                              STAFF_SECTIONS.find((x) => x.id === id)?.label ??
                              id,
                          )
                          .join(' · ')
                      : 'No sections — cannot open the desk'}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-cream hover:border-gold"
                  onClick={() => setEditing(s)}
                >
                  {isOwner ? 'Edit phone' : 'Edit access'}
                </button>
                {!isOwner && (
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-late hover:border-late"
                    onClick={() => {
                      void (async () => {
                        try {
                          const result = await removeStaff(s.id)
                          setStatus(
                            result.synced
                              ? `Removed ${s.name}`
                              : `Removed ${s.name} locally — cloud delete failed: ${result.error}`,
                          )
                        } catch (e) {
                          setStatus(
                            e instanceof Error ? e.message : String(e),
                          )
                        }
                      })()
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {status && <p className="text-xs text-muted">{status}</p>}

      {editing && (
        <StaffEditor
          initial={editing}
          busy={saving}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            void (async () => {
              setSaving(true)
              try {
                const result = await upsertStaff(input)
                if (result.synced) {
                  setEditing(null)
                  setStatus(`Saved ${input.name} to cloud`)
                } else {
                  setStatus(
                    `Saved ${input.name} on this device only — cloud sync failed${
                      result.error ? `: ${result.error}` : ''
                    }. Grants will reset on a new deploy until cloud sync works.`,
                  )
                }
              } catch (e) {
                setStatus(e instanceof Error ? e.message : String(e))
              } finally {
                setSaving(false)
              }
            })()
          }}
        />
      )}
    </div>
  )
}

function StaffEditor({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: StaffMember
  busy?: boolean
  onClose: () => void
  onSave: (input: {
    id?: string
    name: string
    phone: string
    sections: StaffSectionId[]
    active: boolean
  }) => void
}) {
  const isOwner = initial.id === OWNER_STAFF_ID
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [active, setActive] = useState(initial.active)
  const [sections, setSections] = useState<StaffSectionId[]>([
    ...initial.sections.filter((id) => id !== 'staff_access'),
  ])

  function toggle(id: StaffSectionId) {
    setSections((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-surface p-4 sm:rounded-xl sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cream">
            {initial.id
              ? isOwner
                ? 'Owner account'
                : 'Edit access'
              : 'Add staff'}
          </h2>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block text-xs text-muted">
            Name
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isOwner || busy}
            />
          </label>
          <label className="block text-xs text-muted">
            Phone (required to log in)
            <PhoneInput
              className={`${field} font-mono`}
              value={phone}
              onChange={setPhone}
            />
          </label>

          {isOwner ? (
            <p className="rounded-md border border-border bg-ink px-3 py-2 text-xs text-muted">
              Owner — full access to every section, including Staff access and
              Logins &amp; keys. This cannot be limited or removed.
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm text-cream">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  disabled={busy}
                />
                Active (can log in)
              </label>

              <fieldset>
                <legend className="text-xs text-muted">
                  Sections they can see
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {GRANTABLE_SECTIONS.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-xs text-cream"
                    >
                      <input
                        type="checkbox"
                        checked={sections.includes(s.id)}
                        onChange={() => toggle(s.id)}
                        disabled={busy}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    className="text-xs text-gold"
                    onClick={() => setSections([...GRANTABLE_SECTION_IDS])}
                    disabled={busy}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-cream"
                    onClick={() => setSections([])}
                    disabled={busy}
                  >
                    Clear
                  </button>
                </div>
              </fieldset>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
            onClick={() =>
              onSave({
                id: initial.id || undefined,
                name,
                phone,
                sections,
                active,
              })
            }
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
