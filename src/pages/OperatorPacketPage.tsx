/**
 * Public operator network packet — short form from invite email.
 * Charter Cert, D085 (→ tails), COI, contact prefs, ACH + wire.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
import { AirportSelect } from '@/components/AirportSelect'
import {
  QUOTE_CONTACT_PREFS,
  emptyOperatorBanking,
  validateOperatorPacket,
  type QuoteContactPref,
} from '@/domain/operatorPacket'
import { getOperatorInvite } from '@/lib/operatorInviteStore'
import { submitOperatorPacket } from '@/lib/operatorPacketFlow'

const inputCls =
  'mt-1 w-full rounded-md border border-[#d8d0c0] bg-white px-3 py-2.5 text-sm text-[#0c0c0e] outline-none focus:border-[#c9a227]'
const labelCls = 'block text-xs font-medium text-[#6b6560]'

export default function OperatorPacketPage() {
  const { token } = useParams()
  const [search] = useSearchParams()
  const invite = useMemo(
    () => (token ? getOperatorInvite(token) : null),
    [token],
  )
  const prefillCompany =
    invite?.company_name || search.get('company')?.trim() || ''
  const prefillEmail =
    invite?.email || search.get('email')?.trim().toLowerCase() || ''

  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tailNote, setTailNote] = useState('')

  const [company, setCompany] = useState(prefillCompany)
  const [base, setBase] = useState('')
  const [email, setEmail] = useState(prefillEmail)
  const [cell, setCell] = useState('')
  const [contactName, setContactName] = useState('')
  const [quotePref, setQuotePref] = useState<QuoteContactPref>('text')
  const [banking, setBanking] = useState(emptyOperatorBanking)
  const [charter, setCharter] = useState<File | null>(null)
  const [d085, setD085] = useState<File | null>(null)
  const [coi, setCoi] = useState<File | null>(null)

  if (done || invite?.completed_at) {
    return (
      <div className="min-h-dvh bg-[#f7f2e3] px-4 py-10 text-[#0c0c0e]">
        <div className="mx-auto max-w-md space-y-3 text-center">
          <BrandLockup variant="full" className="mx-auto !h-10" />
          <h1 className="text-xl font-semibold">Thanks — you’re in review</h1>
          <p className="text-sm text-[#6b6560]">
            Dispatch will confirm your docs and tails. We’ll reach out on your
            preferred channel for trip offers.
          </p>
          {tailNote ? (
            <p className="font-mono text-xs text-[#8a7018]">{tailNote}</p>
          ) : null}
        </div>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const err = validateOperatorPacket({
      company_name: company,
      email,
      cell,
      quote_pref: quotePref,
    })
    if (err) {
      setError(err)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await submitOperatorPacket({
        invite_token: token,
        company_name: company,
        base_icao: base,
        email,
        cell,
        contact_name: contactName,
        quote_pref: quotePref,
        banking,
        charter,
        d085,
        coi,
      })
      const tails = result.tails.map((t) => t.tail).join(', ')
      setTailNote(
        tails
          ? `Tails from D085: ${tails}${result.d085Note ? ` · ${result.d085Note}` : ''}`
          : result.d085Note || '',
      )
      setDone(true)
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#f7f2e3] text-[#0c0c0e]" data-theme="client">
      <header className="border-b border-[#e5dfd0] bg-[#f7f2e3]/95 px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BrandLockup variant="mark" className="!h-9 !w-9" showTagline={false} />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#c9a227]">
              OnFly Air
            </div>
            <h1 className="text-lg font-semibold">Network packet</h1>
          </div>
        </div>
      </header>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-16"
      >
        <p className="text-sm leading-relaxed text-[#6b6560]">
          Three documents, how we should reach you for quotes, and payment
          details. We pull aircraft from your D085.
        </p>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Company</h2>
          <label className={labelCls}>
            Company name
            <input
              className={inputCls}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />
          </label>
          <AirportSelect
            label="Primary base"
            value={base}
            onChange={setBase}
            placeholder="Search ICAO…"
            optional
          />
          <label className={labelCls}>
            Your name
            <input
              className={inputCls}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Ops contact"
            />
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Documents</h2>
          <label className={labelCls}>
            Charter certificate
            <input
              type="file"
              className={inputCls}
              accept=".pdf,image/*"
              onChange={(e) => setCharter(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className={labelCls}>
            D085 (we add your tails)
            <input
              type="file"
              className={inputCls}
              accept=".pdf,.txt,.csv,image/*"
              onChange={(e) => setD085(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className={labelCls}>
            Certificate of insurance (COI)
            <input
              type="file"
              className={inputCls}
              accept=".pdf,image/*"
              onChange={(e) => setCoi(e.target.files?.[0] ?? null)}
            />
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">How should we reach you?</h2>
          <label className={labelCls}>
            Best email
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Best cell / SMS
            <input
              className={inputCls}
              value={cell}
              onChange={(e) => setCell(e.target.value)}
              placeholder="(555) 555-0100"
            />
          </label>
          <fieldset>
            <legend className={labelCls}>For trip offers / quotes, prefer</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUOTE_CONTACT_PREFS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setQuotePref(p.id)}
                  className={[
                    'rounded-md border px-3 py-2 text-sm font-medium',
                    quotePref === p.id
                      ? 'border-[#c9a227] bg-[#c9a227] text-[#0c0c0e]'
                      : 'border-[#d8d0c0] bg-white text-[#0c0c0e]',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">ACH (direct deposit)</h2>
          <label className={labelCls}>
            Routing number
            <input
              className={`${inputCls} font-mono`}
              value={banking.ach_routing}
              onChange={(e) =>
                setBanking((b) => ({ ...b, ach_routing: e.target.value }))
              }
              inputMode="numeric"
            />
          </label>
          <label className={labelCls}>
            Account number
            <input
              className={`${inputCls} font-mono`}
              value={banking.ach_account}
              onChange={(e) =>
                setBanking((b) => ({ ...b, ach_account: e.target.value }))
              }
              inputMode="numeric"
            />
          </label>
          <div className="flex gap-2">
            {(['checking', 'savings'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setBanking((b) => ({ ...b, ach_account_type: t }))
                }
                className={[
                  'rounded-md border px-3 py-2 text-sm capitalize',
                  banking.ach_account_type === t
                    ? 'border-[#c9a227] bg-[#c9a227]/20'
                    : 'border-[#d8d0c0] bg-white',
                ].join(' ')}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Wire</h2>
          <label className={labelCls}>
            Bank name
            <input
              className={inputCls}
              value={banking.wire_bank_name}
              onChange={(e) =>
                setBanking((b) => ({ ...b, wire_bank_name: e.target.value }))
              }
            />
          </label>
          <label className={labelCls}>
            Beneficiary name
            <input
              className={inputCls}
              value={banking.wire_beneficiary}
              onChange={(e) =>
                setBanking((b) => ({ ...b, wire_beneficiary: e.target.value }))
              }
            />
          </label>
          <label className={labelCls}>
            ABA / routing
            <input
              className={`${inputCls} font-mono`}
              value={banking.wire_routing}
              onChange={(e) =>
                setBanking((b) => ({ ...b, wire_routing: e.target.value }))
              }
            />
          </label>
          <label className={labelCls}>
            Account
            <input
              className={`${inputCls} font-mono`}
              value={banking.wire_account}
              onChange={(e) =>
                setBanking((b) => ({ ...b, wire_account: e.target.value }))
              }
            />
          </label>
          <label className={labelCls}>
            SWIFT <span className="font-normal">(optional)</span>
            <input
              className={`${inputCls} font-mono`}
              value={banking.wire_swift}
              onChange={(e) =>
                setBanking((b) => ({ ...b, wire_swift: e.target.value }))
              }
            />
          </label>
        </section>

        {error && <p className="text-sm text-[#c0392b]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-[#c9a227] px-4 py-3 text-sm font-semibold text-[#0c0c0e] hover:bg-[#e3b341] disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit network packet'}
        </button>
      </form>
    </div>
  )
}
