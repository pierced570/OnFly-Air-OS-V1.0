import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  isLiveEmailConfigured,
  isRealEmailEnabled,
} from '@/adapters/email'
import {
  defaultVendorPacketTemplate,
  renderVendorPacketEmailHtml,
  sendVendorPacketInvite,
} from '@/lib/vendorPacketEmail'
import {
  acceptVendorPacket,
  listPendingVendorPackets,
  listVendorPackets,
  subscribeVendorPackets,
} from '@/lib/vendorPacketStore'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs text-muted'

export function VendorInvitePanel() {
  const live = isLiveEmailConfigured()
  const realFlag = isRealEmailEnabled()
  const [to, setTo] = useState('')
  const [company, setCompany] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pending = useSyncExternalStore(
    subscribeVendorPackets,
    listPendingVendorPackets,
    listPendingVendorPackets,
  )
  const all = useSyncExternalStore(
    subscribeVendorPackets,
    listVendorPackets,
    listVendorPackets,
  )

  const template = useMemo(() => defaultVendorPacketTemplate(), [])
  const html = useMemo(
    () => renderVendorPacketEmailHtml(template, company || undefined),
    [template, company],
  )

  async function send() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await sendVendorPacketInvite({
        to,
        companyName: company || undefined,
        template,
      })
      setStatus(
        live
          ? `Sent to ${result.to}.`
          : `Mock-sent to ${result.to}. Set VITE_EMAIL_ADAPTER=real for live delivery.`,
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-cream">
          Invite W-9 / vendor packet
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sends the payee packet link (
          <span className="avionic text-cream">/vendor</span>
          ) — W-9 fields, banking, certification.
          {live
            ? ' Email is live.'
            : realFlag
              ? ' Email adapter is real but Supabase keys are missing.'
              : ' Email is mock until Resend is wired.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Payee email
          <input
            type="email"
            className={field}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="ap@operator.com"
            autoComplete="email"
          />
        </label>
        <label className={label}>
          Company <span className="normal-case text-muted/70">(optional)</span>
          <input
            className={field}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Air"
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
          {busy ? 'Sending…' : 'Send packet link'}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
        >
          Preview
        </button>
        <a
          href="/vendor"
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
        >
          Open form
        </a>
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}

      {pending.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gold">
            Pending review ({pending.length})
          </h3>
          <ul className="space-y-2">
            {pending.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-ink/40 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-cream">
                    {row.draft.dba || row.draft.legal_name}
                  </div>
                  <div className="avionic text-[11px] text-muted">
                    {row.tin_display} · {row.draft.ap_email} ·{' '}
                    {row.draft.vendor_kind}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded border border-gold/40 px-2 py-1 text-[11px] text-gold hover:bg-gold/10"
                  onClick={() => acceptVendorPacket(row.id)}
                >
                  Mark accepted
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {all.length > 0 && pending.length === 0 && (
        <p className="text-[11px] text-muted">
          {all.length} packet{all.length === 1 ? '' : 's'} on file — none pending.
        </p>
      )}

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Vendor packet email preview"
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
              title="Vendor packet invite preview"
              className="min-h-[50vh] w-full flex-1 bg-white"
              srcDoc={html}
            />
          </div>
        </div>
      )}
    </div>
  )
}
