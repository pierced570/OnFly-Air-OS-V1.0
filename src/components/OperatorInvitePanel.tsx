/**
 * Network hub — send short invite with /join/:token packet link.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  isLiveEmailConfigured,
  isRealEmailEnabled,
} from '@/adapters/email'
import { absoluteAppUrl } from '@/lib/appUrl'
import {
  listOperatorInvites,
  subscribeOperatorInvites,
} from '@/lib/operatorInviteStore'
import {
  joinPacketUrl,
  renderShortNetworkInviteHtml,
  sendNetworkPacketInvite,
} from '@/lib/operatorNetworkInviteEmail'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs text-muted'

export function OperatorInvitePanel() {
  const live = isLiveEmailConfigured()
  const realFlag = isRealEmailEnabled()
  const invites = useSyncExternalStore(
    subscribeOperatorInvites,
    listOperatorInvites,
    listOperatorInvites,
  )
  const [to, setTo] = useState('')
  const [company, setCompany] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [lastUrl, setLastUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const previewHtml = useMemo(
    () =>
      renderShortNetworkInviteHtml({
        companyName: company || undefined,
        joinUrl: absoluteAppUrl('/join/preview-token'),
      }),
    [company],
  )

  async function send() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await sendNetworkPacketInvite({
        to,
        companyName: company || undefined,
      })
      setLastUrl(result.joinUrl)
      setStatus(`Sent to ${result.to}.`)
      setTo('')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-cream">Add to network</h2>
        <p className="mt-1 text-sm text-muted">
          Short email with a personal link. They upload Charter Cert, D085
          (tails auto-pull), COI, quote contact preference, and ACH / wire.
          {!live && realFlag
            ? ' Email delivery needs Supabase keys configured.'
            : ''}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Operator email
          <input
            type="email"
            className={field}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="ops@operator.com"
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
          Preview email
        </button>
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}
      {lastUrl && (
        <p className="break-all font-mono text-xs text-gold">
          Link: {lastUrl}
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-muted">
          Recent invites
        </h3>
        {invites.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="space-y-2">
            {invites.slice(0, 12).map((inv) => (
              <li
                key={inv.token}
                className="rounded-md border border-border bg-ink px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-cream">
                    {inv.company_name || inv.email}
                  </span>
                  <span className="text-xs text-muted">
                    {inv.completed_at
                      ? 'Submitted'
                      : inv.sent_at
                        ? 'Sent'
                        : 'Draft'}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">{inv.email}</div>
                <a
                  href={joinPacketUrl(inv.token)}
                  className="mt-1 inline-block font-mono text-[11px] text-gold hover:text-gold-lt"
                  target="_blank"
                  rel="noreferrer"
                >
                  {joinPacketUrl(inv.token)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted">
        After they submit, open <span className="text-cream">Operators</span>{' '}
        — docs show on their card (Charter / D085 / COI). Confirm tails and
        NEEDS-INFO flags before booking.
      </p>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Email preview"
        >
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-cream sm:rounded-xl">
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
              title="Network invite preview"
              className="min-h-[60vh] w-full flex-1 bg-white"
              srcDoc={previewHtml}
            />
          </div>
        </div>
      )}
    </div>
  )
}
