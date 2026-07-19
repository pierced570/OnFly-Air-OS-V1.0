import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  LEAD_KIND_LABELS,
  LEAD_KINDS,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  defaultFollowUpIso,
  followUpMailto,
  followUpState,
  type Lead,
  type LeadFollowUpState,
  type LeadKind,
  type LeadStatus,
} from '@/domain/leads'
import {
  addLead,
  countNeedsTouch,
  deleteLead,
  listLeads,
  logLeadTouch,
  queryLeads,
  subscribeLeads,
  updateLead,
} from '@/lib/leadStore'
import { getSession, subscribeStaff } from '@/lib/staffStore'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'
const select = `${input} appearance-none`

function fmtDay(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

function fuTone(state: LeadFollowUpState): string {
  if (state === 'overdue') return 'text-late'
  if (state === 'due_today') return 'text-gold'
  if (state === 'upcoming') return 'text-onplan'
  return 'text-muted'
}

function fuLabel(state: LeadFollowUpState): string {
  if (state === 'overdue') return 'Overdue'
  if (state === 'due_today') return 'Due today'
  if (state === 'upcoming') return 'Upcoming'
  return 'No follow-up'
}

type DraftForm = {
  company: string
  contact_name: string
  title: string
  email: string
  phone: string
  kind: LeadKind
  status: LeadStatus
  notes: string
  owner: string
  next_follow_up_at: string
}

function emptyDraft(owner = ''): DraftForm {
  return {
    company: '',
    contact_name: '',
    title: '',
    email: '',
    phone: '',
    kind: 'operator',
    status: 'open',
    notes: '',
    owner,
    next_follow_up_at: defaultFollowUpIso(3).slice(0, 10),
  }
}

function draftFromLead(lead: Lead): DraftForm {
  return {
    company: lead.company,
    contact_name: lead.contact_name,
    title: lead.title,
    email: lead.email,
    phone: lead.phone,
    kind: lead.kind,
    status: lead.status,
    notes: lead.notes,
    owner: lead.owner,
    next_follow_up_at: lead.next_follow_up_at
      ? lead.next_follow_up_at.slice(0, 10)
      : '',
  }
}

function toFollowUpIso(day: string): string | null {
  const t = day.trim()
  if (!t) return null
  return `${t}T15:00:00.000Z`
}

export default function LeadsPage() {
  const allLeads = useSyncExternalStore(subscribeLeads, listLeads, listLeads)
  const session = useSyncExternalStore(subscribeStaff, getSession, getSession)
  const ownerDefault = session?.name ?? ''

  const [q, setQ] = useState('')
  const [kind, setKind] = useState<LeadKind | 'all'>('all')
  const [status, setStatus] = useState<LeadStatus | 'all' | 'active'>('active')
  const [followUp, setFollowUp] = useState<
    LeadFollowUpState | 'all' | 'needs_touch'
  >('all')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<DraftForm>(() => emptyDraft(ownerDefault))
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [touchId, setTouchId] = useState<string | null>(null)
  const [touchNote, setTouchNote] = useState('')
  const [touchDays, setTouchDays] = useState('3')
  const [touchStatus, setTouchStatus] = useState<LeadStatus | ''>('')

  const needsTouch = countNeedsTouch()
  const rows = useMemo(
    () => queryLeads({ q, kind, status, followUp, sort: 'follow_up' }),
    [allLeads, q, kind, status, followUp],
  )

  function openAdd() {
    setEditingId(null)
    setDraft(emptyDraft(ownerDefault))
    setFormError(null)
    setShowAdd(true)
  }

  function openEdit(lead: Lead) {
    setEditingId(lead.id)
    setDraft(draftFromLead(lead))
    setFormError(null)
    setShowAdd(true)
  }

  function saveDraft() {
    const nextFollow = toFollowUpIso(draft.next_follow_up_at)
    try {
      if (editingId) {
        updateLead(editingId, {
          company: draft.company,
          contact_name: draft.contact_name,
          title: draft.title,
          email: draft.email,
          phone: draft.phone,
          kind: draft.kind,
          status: draft.status,
          notes: draft.notes,
          owner: draft.owner,
          next_follow_up_at: nextFollow,
        })
      } else {
        addLead({
          company: draft.company,
          contact_name: draft.contact_name,
          title: draft.title,
          email: draft.email,
          phone: draft.phone,
          kind: draft.kind,
          status: draft.status,
          notes: draft.notes,
          owner: draft.owner || ownerDefault,
          next_follow_up_at: nextFollow,
          last_touch_note: draft.notes.trim() || undefined,
        })
      }
      setShowAdd(false)
      setEditingId(null)
      setFormError(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  function startTouch(lead: Lead) {
    setTouchId(lead.id)
    setTouchNote('')
    setTouchDays('3')
    setTouchStatus('')
  }

  function commitTouch() {
    if (!touchId) return
    const days =
      touchDays.trim() === ''
        ? null
        : Math.max(0, Number.parseInt(touchDays, 10) || 0)
    logLeadTouch(touchId, {
      note: touchNote,
      followUpInDays: days,
      status: touchStatus || undefined,
    })
    setTouchId(null)
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Business development
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">Leads</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Who you talked to, at which company — log touches and queue the next
            follow-up.
          </p>
        </div>
        <button
          type="button"
          className="tap rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink"
          onClick={openAdd}
        >
          + Add lead
        </button>
      </header>

      {needsTouch > 0 && (
        <button
          type="button"
          onClick={() => setFollowUp('needs_touch')}
          className="tap flex w-full items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-left sm:w-auto"
        >
          <span className="text-sm text-cream">
            <span className="font-medium text-gold">{needsTouch}</span>
            {' '}need{needsTouch === 1 ? 's' : ''} a touch (overdue or due today)
          </span>
          <span className="text-xs text-gold">Show →</span>
        </button>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, contact, notes…"
          className="rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold sm:col-span-2 lg:col-span-1"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LeadKind | 'all')}
          className="rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream"
        >
          <option value="all">All kinds</option>
          {LEAD_KINDS.map((k) => (
            <option key={k} value={k}>
              {LEAD_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as LeadStatus | 'all' | 'active')
          }
          className="rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream"
        >
          <option value="active">Active (open / warming)</option>
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={followUp}
          onChange={(e) =>
            setFollowUp(
              e.target.value as LeadFollowUpState | 'all' | 'needs_touch',
            )
          }
          className="rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream"
        >
          <option value="all">Any follow-up</option>
          <option value="needs_touch">Needs touch</option>
          <option value="overdue">Overdue</option>
          <option value="due_today">Due today</option>
          <option value="upcoming">Upcoming</option>
          <option value="none">No date set</option>
        </select>
      </div>

      {showAdd && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-cream">
            {editingId ? 'Edit lead' : 'New lead'}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Company *
              <input
                className={input}
                value={draft.company}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, company: e.target.value }))
                }
              />
            </label>
            <label className={label}>
              Contact *
              <input
                className={input}
                value={draft.contact_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact_name: e.target.value }))
                }
              />
            </label>
            <label className={label}>
              Title
              <input
                className={input}
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
              />
            </label>
            <label className={label}>
              Owner
              <input
                className={input}
                value={draft.owner}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, owner: e.target.value }))
                }
                placeholder={ownerDefault || 'Your name'}
              />
            </label>
            <label className={label}>
              Email
              <input
                type="email"
                className={input}
                value={draft.email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, email: e.target.value }))
                }
              />
            </label>
            <label className={label}>
              Phone
              <input
                type="tel"
                className={input}
                value={draft.phone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, phone: e.target.value }))
                }
              />
            </label>
            <label className={label}>
              Kind
              <select
                className={select}
                value={draft.kind}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    kind: e.target.value as LeadKind,
                  }))
                }
              >
                {LEAD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LEAD_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Status
              <select
                className={select}
                value={draft.status}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    status: e.target.value as LeadStatus,
                  }))
                }
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Next follow-up (UTC day)
              <input
                type="date"
                className={input}
                value={draft.next_follow_up_at}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    next_follow_up_at: e.target.value,
                  }))
                }
              />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Notes
              <textarea
                rows={3}
                className={input}
                value={draft.notes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
              />
            </label>
          </div>
          {formError && (
            <p className="mt-2 text-sm text-late">{formError}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="tap rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink"
              onClick={saveDraft}
            >
              {editingId ? 'Save' : 'Add lead'}
            </button>
            <button
              type="button"
              className="tap rounded-md border border-border px-4 py-2.5 text-sm text-cream"
              onClick={() => {
                setShowAdd(false)
                setEditingId(null)
              }}
            >
              Cancel
            </button>
            {editingId && (
              <button
                type="button"
                className="tap ml-auto rounded-md border border-late/40 px-4 py-2.5 text-sm text-late"
                onClick={() => {
                  if (window.confirm('Delete this lead?')) {
                    deleteLead(editingId)
                    setShowAdd(false)
                    setEditingId(null)
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
        </section>
      )}

      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No leads match. Add someone you talked to, or clear filters.
          </li>
        )}
        {rows.map((lead) => {
          const fu = followUpState(lead.next_follow_up_at)
          const mail = followUpMailto(lead)
          const touching = touchId === lead.id
          return (
            <li
              key={lead.id}
              className="rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-cream">{lead.company}</div>
                  <div className="mt-0.5 text-sm text-cream">
                    {lead.contact_name}
                    {lead.title ? (
                      <span className="text-muted"> · {lead.title}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{LEAD_KIND_LABELS[lead.kind]}</span>
                    <span>{LEAD_STATUS_LABELS[lead.status]}</span>
                    {lead.owner && <span>Owner {lead.owner}</span>}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className={fuTone(fu)}>{fuLabel(fu)}</div>
                  <div className="avionic mt-0.5 text-muted">
                    {fmtDay(lead.next_follow_up_at)}
                  </div>
                  <div className="mt-1 text-muted">
                    Last {fmtDay(lead.last_contacted_at)}
                  </div>
                </div>
              </div>

              {lead.last_touch_note && (
                <p className="mt-2 text-sm text-muted">
                  Last touch: {lead.last_touch_note}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {mail && (
                  <a
                    href={mail}
                    className="tap rounded-md bg-gold px-3 py-2 text-xs font-medium text-ink"
                  >
                    Email follow-up
                  </a>
                )}
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone.replace(/\D/g, '')}`}
                    className="tap avionic rounded-md border border-border px-3 py-2 text-xs text-cream"
                  >
                    {lead.phone}
                  </a>
                )}
                {lead.email && !mail && (
                  <span className="avionic self-center text-xs text-muted">
                    {lead.email}
                  </span>
                )}
                <button
                  type="button"
                  className="tap rounded-md border border-border px-3 py-2 text-xs text-cream hover:border-gold/40"
                  onClick={() => startTouch(lead)}
                >
                  Log touch
                </button>
                <button
                  type="button"
                  className="tap rounded-md border border-border px-3 py-2 text-xs text-muted hover:text-cream"
                  onClick={() => openEdit(lead)}
                >
                  Edit
                </button>
              </div>

              {touching && (
                <div className="mt-3 space-y-2 rounded-md border border-border bg-ink/60 p-3">
                  <label className={label}>
                    What did you cover / next ask?
                    <textarea
                      rows={2}
                      className={input}
                      value={touchNote}
                      onChange={(e) => setTouchNote(e.target.value)}
                      placeholder="Left voicemail about weekend capacity…"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={label}>
                      Follow up in (days)
                      <input
                        className={input}
                        value={touchDays}
                        onChange={(e) => setTouchDays(e.target.value)}
                        placeholder="3 — blank clears"
                      />
                    </label>
                    <label className={label}>
                      Status (optional)
                      <select
                        className={select}
                        value={touchStatus}
                        onChange={(e) =>
                          setTouchStatus(
                            e.target.value as LeadStatus | '',
                          )
                        }
                      >
                        <option value="">Keep {LEAD_STATUS_LABELS[lead.status]}</option>
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="tap rounded-md bg-gold px-3 py-2 text-xs font-medium text-ink"
                      onClick={commitTouch}
                    >
                      Save touch
                    </button>
                    <button
                      type="button"
                      className="tap rounded-md border border-border px-3 py-2 text-xs text-muted"
                      onClick={() => setTouchId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
