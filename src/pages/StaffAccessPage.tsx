import { useSyncExternalStore, useState } from 'react'
import {
  ALL_SECTION_IDS,
  STAFF_SECTIONS,
  type StaffMember,
  type StaffSectionId,
} from '@/domain/staffAccess'
import {
  getSession,
  listStaff,
  removeStaff,
  subscribeStaff,
  upsertStaff,
} from '@/lib/staffStore'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'

export default function StaffAccessPage() {
  const staff = useSyncExternalStore(subscribeStaff, listStaff, listStaff)
  const session = useSyncExternalStore(subscribeStaff, getSession, () => null)
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  if (!session?.is_admin) {
    return (
      <div className="p-6 text-sm text-late">
        Admin only — you don&apos;t have Staff access.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Staff access</h1>
        <p className="mt-1 text-sm text-muted">
          Register each dispatcher with name + phone. Toggle which sections they
          can open. Admins always get every section, including Logins &amp; keys.
        </p>
      </header>

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
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {staff.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium text-cream">
                {s.name}
                {s.is_admin && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                    admin
                  </span>
                )}
                {!s.active && (
                  <span className="ml-2 text-[10px] uppercase text-late">
                    inactive
                  </span>
                )}
              </div>
              <div className="avionic text-xs text-muted">
                {s.phone || 'phone not set — cannot log in'}
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {s.is_admin
                  ? 'All sections'
                  : s.sections.map((id) => STAFF_SECTIONS.find((x) => x.id === id)?.label ?? id).join(' · ')}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-cream hover:border-gold"
                onClick={() => setEditing(s)}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-late hover:border-late"
                onClick={() => {
                  try {
                    removeStaff(s.id)
                    setStatus(`Removed ${s.name}`)
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {status && <p className="text-xs text-muted">{status}</p>}

      {editing && (
        <StaffEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            upsertStaff(input)
            setEditing(null)
            setStatus(`Saved ${input.name}`)
          }}
        />
      )}
    </div>
  )
}

function StaffEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: StaffMember
  onClose: () => void
  onSave: (input: {
    id?: string
    name: string
    phone: string
    is_admin: boolean
    sections: StaffSectionId[]
    active: boolean
  }) => void
}) {
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [isAdmin, setIsAdmin] = useState(initial.is_admin)
  const [active, setActive] = useState(initial.active)
  const [sections, setSections] = useState<StaffSectionId[]>([
    ...initial.sections,
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
            {initial.id ? 'Edit staff' : 'Add staff'}
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
            />
          </label>
          <label className="block text-xs text-muted">
            Phone (required to log in)
            <input
              className={`${field} font-mono`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="555-555-5555"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            Admin (all sections + manage staff)
          </label>
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active
          </label>

          {!isAdmin && (
            <fieldset>
              <legend className="text-xs text-muted">Sections</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {STAFF_SECTIONS.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-xs text-cream"
                  >
                    <input
                      type="checkbox"
                      checked={sections.includes(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="mt-2 text-xs text-gold"
                onClick={() => setSections([...ALL_SECTION_IDS])}
              >
                Select all
              </button>
            </fieldset>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-ink"
            onClick={() =>
              onSave({
                id: initial.id || undefined,
                name,
                phone,
                is_admin: isAdmin,
                sections,
                active,
              })
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
