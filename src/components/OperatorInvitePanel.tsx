import { useMemo, useState } from 'react'
import {
  defaultOnboardTemplate,
  LEGACY_ONBOARD_URL,
  renderOperatorOnboardEmailHtml,
  sendOperatorOnboardInvite,
  type OperatorOnboardTemplate,
} from '@/lib/operatorOnboardEmail'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs text-muted'

export function OperatorInvitePanel() {
  const [to, setTo] = useState('')
  const [company, setCompany] = useState('')
  const [buttonText, setButtonText] = useState('Complete Onboarding Form')
  const [closing, setClosing] = useState(
    'Please fill out our onboarding form — we would love to have you in our network.',
  )
  const [skyiqPitch, setSkyiqPitch] = useState(
    'With fuel prices on the rise, please consider checking out our sister company SkyIQ — your fuel intelligence partner.',
  )
  const [skyiqUrl, setSkyiqUrl] = useState('https://info.skyiq.net/')
  const [skyiqLink, setSkyiqLink] = useState('Learn more about SkyIQ →')
  const [onboardUrl, setOnboardUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/onboard`
    }
    return '/onboard'
  })
  const [refsText, setRefsText] = useState(
    'Sonrise Aviation — (260) 766-4548\nAxio — (864) 397-5082\nAmeristar — (972) 248-2478',
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const template: OperatorOnboardTemplate = useMemo(() => {
    const references = refsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, phone] = line.split('—').map((s) => s.trim())
        return {
          name: name || line,
          phone: phone || '',
        }
      })
    return defaultOnboardTemplate({
      buttonText,
      closingMessage: closing,
      skyiqPitch,
      skyiqUrl,
      skyiqLinkText: skyiqLink,
      onboardUrl,
      references,
    })
  }, [
    buttonText,
    closing,
    skyiqPitch,
    skyiqUrl,
    skyiqLink,
    onboardUrl,
    refsText,
  ])

  const html = useMemo(
    () => renderOperatorOnboardEmailHtml(template),
    [template],
  )

  async function send() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await sendOperatorOnboardInvite({
        to,
        companyName: company || undefined,
        template,
      })
      setStatus(`Invite sent to ${result.to} (mock email id ${result.id}).`)
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
          Invite operator (email)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sends the network invite with onboarding form + SkyIQ footer. Form is{' '}
          <span className="avionic text-cream">/onboard</span> (no insured-amount
          field — that comes from COI). Legacy ops link:{' '}
          <a
            href={LEGACY_ONBOARD_URL}
            className="text-gold hover:text-gold-lt"
            target="_blank"
            rel="noreferrer"
          >
            operations.onflyair.com/onboard
          </a>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Operator email *
          <input
            type="email"
            className={field}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="ops@operator.com"
          />
        </label>
        <label className={label}>
          Company (optional)
          <input
            className={field}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Onboarding form URL
          <input
            className={field}
            value={onboardUrl}
            onChange={(e) => setOnboardUrl(e.target.value)}
          />
        </label>
        <label className={label}>
          Button text
          <input
            className={field}
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
          />
        </label>
        <label className={label}>
          SkyIQ link text
          <input
            className={field}
            value={skyiqLink}
            onChange={(e) => setSkyiqLink(e.target.value)}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Closing message
          <textarea
            className={field}
            rows={2}
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          SkyIQ pitch
          <textarea
            className={field}
            rows={2}
            value={skyiqPitch}
            onChange={(e) => setSkyiqPitch(e.target.value)}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          SkyIQ website
          <input
            className={field}
            value={skyiqUrl}
            onChange={(e) => setSkyiqUrl(e.target.value)}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          References (one per line: Name — phone)
          <textarea
            className={field}
            rows={3}
            value={refsText}
            onChange={(e) => setRefsText(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="rounded-md border border-gold/40 px-4 py-2 text-sm text-gold hover:bg-gold/10"
        >
          Preview email
        </button>
        <button
          type="button"
          disabled={busy || !to.includes('@')}
          onClick={() => void send()}
          className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Email preview"
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
              title="Operator invite preview"
              className="min-h-[70vh] w-full flex-1 bg-white"
              srcDoc={html}
            />
          </div>
        </div>
      )}
    </div>
  )
}
