import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  listIntakeDrafts,
  simulateInboundEmail,
  simulateInboundSms,
  subscribeIntake,
} from '@/lib/intakeStore'
import { listRequestAlertEmails } from '@/lib/clientStore'

export default function IntakePage() {
  const drafts = useSyncExternalStore(subscribeIntake, listIntakeDrafts, () => [])
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('Need a plane tonight')
  const [body, setBody] = useState(
    'Need 3 skids from Akron to Chicago ready at 9am. Cargo only.',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alertEmails = listRequestAlertEmails()

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      if (channel === 'email') {
        await simulateInboundEmail({ from, subject, body })
      } else {
        await simulateInboundSms({ from, body })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:flex-row lg:p-8">
      <section className="w-full space-y-4 lg:w-[420px]">
        <header>
          <h1 className="text-2xl font-semibold text-cream">Intake simulator</h1>
          <p className="mt-1 text-sm text-muted">
            Mock email/SMS → LLM extract → ring on-shift → review queue. Live Resend /
            RC webhooks later.
          </p>
        </header>

        <div className="rounded-lg border border-border bg-surface p-3 text-xs text-muted">
          <div className="uppercase tracking-wider text-gold">Phone-ring emails</div>
          {alertEmails.length === 0 ? (
            <p className="mt-2">
              None flagged yet — simulator accepts any email until you flag requesters on{' '}
              <Link to="/clients" className="text-gold">
                Clients
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-2 space-y-1 avionic text-cream">
              {alertEmails.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className={channel === 'email' ? 'flex-1 rounded bg-gold py-2 text-sm text-ink' : 'flex-1 rounded bg-surface-2 py-2 text-sm text-muted'}
            onClick={() => setChannel('email')}
          >
            Email
          </button>
          <button
            type="button"
            className={channel === 'sms' ? 'flex-1 rounded bg-gold py-2 text-sm text-ink' : 'flex-1 rounded bg-surface-2 py-2 text-sm text-muted'}
            onClick={() => setChannel('sms')}
          >
            SMS
          </button>
        </div>

        <label className="block text-xs uppercase text-muted">
          From
          <input
            className="mt-1 w-full rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder={channel === 'email' ? 'ops@client.com' : '+15551234567'}
          />
        </label>
        {channel === 'email' && (
          <label className="block text-xs uppercase text-muted">
            Subject
            <input
              className="mt-1 w-full rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
        )}
        <label className="block text-xs uppercase text-muted">
          Body
          <textarea
            className="mt-1 w-full rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-late">{error}</p>}
        <button
          type="button"
          disabled={busy || !from.trim() || !body.trim()}
          className="w-full rounded-md bg-gold py-2.5 text-sm font-medium text-ink disabled:opacity-40"
          onClick={() => void submit()}
        >
          {busy ? 'Processing…' : 'Simulate inbound'}
        </button>
      </section>

      <section className="min-w-0 flex-1 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-gold">Review queue</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted">No inbound yet.</p>
        ) : (
          drafts.map((d) => (
            <div
              key={d.id}
              className={[
                'rounded-lg border px-4 py-3',
                d.status === 'pending_review'
                  ? 'border-gold/40 bg-gold/10'
                  : 'border-border bg-surface',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-cream">
                    {d.channel.toUpperCase()} · {d.from}
                  </div>
                  <div className="text-xs text-muted">{d.subject}</div>
                </div>
                <span className="avionic text-xs text-gold">{d.status}</span>
              </div>
              {d.extracted && (
                <p className="mt-2 text-sm text-cream">
                  {String(d.extracted.origin_text ?? '—')} →{' '}
                  {String(d.extracted.destination_text ?? '—')}
                  {d.extracted.pieces_text
                    ? ` · ${String(d.extracted.pieces_text)}`
                    : ''}
                </p>
              )}
              {d.ignore_reason && (
                <p className="mt-1 text-xs text-late">{d.ignore_reason}</p>
              )}
              {d.status === 'pending_review' && (
                <Link
                  to={`/intake/${d.id}`}
                  className="mt-2 inline-block text-xs text-gold hover:text-gold-lt"
                >
                  Open review →
                </Link>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  )
}
