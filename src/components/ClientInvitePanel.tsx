import { useMemo, useState } from 'react'
import {
  isLiveEmailConfigured,
  isRealEmailEnabled,
} from '@/adapters/email'
import {
  buildClientInviteTemplate,
  sendClientOnboardInvite,
} from '@/lib/clientInviteEmail'
import { renderClientInviteEmailHtml } from '@/domain/clientInviteEmail'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs text-muted'

export function ClientInvitePanel(props?: {
  /** Prefill email (Clients page contact). */
  defaultEmail?: string
  defaultCompany?: string
  defaultName?: string
  compact?: boolean
}) {
  const live = isLiveEmailConfigured()
  const realFlag = isRealEmailEnabled()
  const [to, setTo] = useState(props?.defaultEmail ?? '')
  const [company, setCompany] = useState(props?.defaultCompany ?? '')
  const [name, setName] = useState(props?.defaultName ?? '')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const template = useMemo(
    () =>
      buildClientInviteTemplate({
        companyName: company || undefined,
        recipientName: name || undefined,
      }),
    [company, name],
  )
  const html = useMemo(
    () => renderClientInviteEmailHtml(template),
    [template],
  )

  async function send() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await sendClientOnboardInvite({
        to,
        companyName: company || undefined,
        recipientName: name || undefined,
        template,
      })
      setStatus(
        live
          ? `Welcome email sent to ${result.to}.`
          : `Mock-sent to ${result.to}. Set VITE_EMAIL_ADAPTER=real for live delivery.`,
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={[
        'space-y-4 rounded-lg border border-border bg-surface',
        props?.compact ? 'p-3' : 'p-4 sm:p-5',
      ].join(' ')}
    >
      <div>
        <h2
          className={
            props?.compact
              ? 'text-sm font-semibold text-cream'
              : 'text-lg font-semibold text-cream'
          }
        >
          Invite client
        </h2>
        <p className="mt-1 text-sm text-muted">
          Enter an email — we send a professional welcome with the setup form
          link (
          <span className="avionic text-cream">/client</span>
          ).
          {live
            ? ' Email is live.'
            : realFlag
              ? ' Email adapter is real but Supabase keys are missing.'
              : ' Email is mock until Resend is wired.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Client email
          <input
            type="email"
            className={field}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="ops@client.com"
            autoComplete="email"
          />
        </label>
        <label className={label}>
          Company <span className="normal-case text-muted/70">(optional)</span>
          <input
            className={field}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme MRO"
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Contact name <span className="normal-case text-muted/70">(optional)</span>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jordan Lee"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !to.includes('@')}
          onClick={() => void send()}
          className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send welcome email'}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
        >
          Preview
        </button>
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Client invite email preview"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-border bg-cream sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Email preview</h3>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <iframe
              title="Client invite preview"
              className="min-h-[70vh] w-full flex-1 bg-white"
              srcDoc={html}
            />
          </div>
        </div>
      )}
    </div>
  )
}
