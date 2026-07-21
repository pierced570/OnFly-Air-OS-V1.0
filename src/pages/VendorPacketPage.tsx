/**
 * Public W-9 + vendor banking packet.
 * Shareable link for operators / FBOs / other payees OnFly needs on file.
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
import {
  ACCOUNT_TYPES,
  LLC_TAX_CLASSIFICATIONS,
  TAX_CLASSIFICATIONS,
  emptyVendorPacketDraft,
  taxClassificationLabel,
  validateVendorPacket,
  type TaxClassification,
  type VendorAddress,
  type VendorPacketDraft,
} from '@/domain/vendorPacket'
import { submitVendorPacket } from '@/lib/vendorPacketStore'

const inputCls =
  'mt-1.5 w-full rounded-md border border-[#d4cfc0] bg-white px-3 py-3 text-base text-[#0c0c0e] placeholder:text-[#8a8680] outline-none transition-colors focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25'
const labelCls = 'block text-sm font-semibold text-[#2a2a2e]'
const hintCls = 'text-sm leading-relaxed text-[#5c574c]'
const sectionCls =
  'space-y-4 rounded-xl border border-[#e5dfd0] bg-white p-5 shadow-sm sm:p-6'
const checkCls =
  'flex items-start gap-3 text-sm leading-snug text-[#0c0c0e] [&_input]:mt-0.5 [&_input]:h-4 [&_input]:w-4 [&_input]:shrink-0'
const sectionTitleCls = 'text-lg font-semibold tracking-tight text-[#0c0c0e]'

function AddressFields({
  value,
  onChange,
  prefix,
}: {
  value: VendorAddress
  onChange: (p: Partial<VendorAddress>) => void
  prefix: string
}) {
  return (
    <div className="space-y-3">
      <label className={labelCls}>
        Street
        <input
          className={inputCls}
          value={value.street}
          onChange={(e) => onChange({ street: e.target.value })}
          autoComplete={`${prefix} street-address`}
          required
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`${labelCls} sm:col-span-1`}>
          City
          <input
            className={inputCls}
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            autoComplete={`${prefix} address-level2`}
            required
          />
        </label>
        <label className={labelCls}>
          State
          <input
            className={inputCls}
            value={value.state}
            onChange={(e) => onChange({ state: e.target.value.toUpperCase() })}
            maxLength={2}
            placeholder="CA"
            autoComplete={`${prefix} address-level1`}
            required
          />
        </label>
        <label className={labelCls}>
          ZIP
          <input
            className={inputCls}
            value={value.zip}
            onChange={(e) => onChange({ zip: e.target.value })}
            autoComplete={`${prefix} postal-code`}
            required
          />
        </label>
      </div>
    </div>
  )
}

export default function VendorPacketPage() {
  const [draft, setDraft] = useState<VendorPacketDraft>(() =>
    emptyVendorPacketDraft(),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; name: string } | null>(null)

  function patch(p: Partial<VendorPacketDraft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const v = validateVendorPacket(draft)
    if (!v.ok) {
      setError(v.errors.join(' · '))
      return
    }
    setBusy(true)
    try {
      const row = submitVendorPacket(draft)
      setDone({
        id: row.id,
        name: row.draft.dba || row.draft.legal_name,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#f7f2e3] text-[#0c0c0e]" data-theme="client">
        <header className="border-b border-[#e5dfd0] bg-white px-6 py-5">
          <div className="mx-auto max-w-lg">
            <BrandLockup />
            <h1 className="mt-3 text-2xl font-semibold text-[#0c0c0e]">
              Packet received
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-lg space-y-4 p-6">
          <p className={hintCls}>
            Thanks —{' '}
            <span className="font-semibold text-[#0c0c0e]">{done.name}</span> is
            in our review queue. Our AP team will verify the W-9 and banking
            details before any payment runs.
          </p>
          <p className="avionic text-xs text-[#8a8680]">Ref {done.id.slice(0, 8)}</p>
          <Link
            to="/onboard"
            className="inline-block rounded-md bg-[#c9a227] px-4 py-2.5 text-sm font-semibold text-[#0c0c0e] hover:bg-[#e3b341]"
          >
            Operator network form
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f2e3] text-[#0c0c0e]" data-theme="client">
      <header className="border-b border-[#e5dfd0] bg-white px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <BrandLockup />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#0c0c0e] sm:text-3xl">
            W-9 &amp; vendor packet
          </h1>
          <p className={`mt-2 max-w-xl ${hintCls}`}>
            For operators and other payees we remit to. Complete the W-9
            fields, banking, and certification — our team reviews before
            anything hits AP. Never share this link in a public channel.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 pb-16 sm:p-6">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>1. Who you are</h2>
            <fieldset className="space-y-2">
              <legend className={labelCls}>Vendor type</legend>
              {(
                [
                  ['operator', 'Part 135 / charter operator'],
                  ['fbo', 'FBO / ground vendor'],
                  ['other', 'Other payee'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={checkCls}>
                  <input
                    type="radio"
                    name="vendor_kind"
                    checked={draft.vendor_kind === value}
                    onChange={() => patch({ vendor_kind: value })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className={labelCls}>
              Legal name (as on tax return) *
              <input
                className={inputCls}
                value={draft.legal_name}
                onChange={(e) => patch({ legal_name: e.target.value })}
                required
              />
            </label>
            <label className={labelCls}>
              Business name / DBA (if different)
              <input
                className={inputCls}
                value={draft.dba}
                onChange={(e) => patch({ dba: e.target.value })}
              />
            </label>
          </section>

          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>2. Federal tax classification</h2>
            <p className={hintCls}>
              Matches IRS Form W-9 Line 3. Pick one.
            </p>
            <div className="space-y-2">
              {TAX_CLASSIFICATIONS.map((c) => (
                <label key={c} className={checkCls}>
                  <input
                    type="radio"
                    name="tax_class"
                    checked={draft.tax_classification === c}
                    onChange={() =>
                      patch({
                        tax_classification: c as TaxClassification,
                        llc_classification:
                          c === 'llc' ? draft.llc_classification : '',
                      })
                    }
                  />
                  {taxClassificationLabel(c)}
                </label>
              ))}
            </div>
            {draft.tax_classification === 'llc' && (
              <label className={labelCls}>
                LLC taxed as *
                <select
                  className={inputCls}
                  value={draft.llc_classification}
                  onChange={(e) =>
                    patch({
                      llc_classification: e.target
                        .value as VendorPacketDraft['llc_classification'],
                    })
                  }
                  required
                >
                  <option value="">Select…</option>
                  {LLC_TAX_CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {taxClassificationLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.tax_classification === 'other' && (
              <label className={labelCls}>
                Describe *
                <input
                  className={inputCls}
                  value={draft.other_classification}
                  onChange={(e) =>
                    patch({ other_classification: e.target.value })
                  }
                  required
                />
              </label>
            )}
          </section>

          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>3. Address</h2>
            <AddressFields
              prefix="billing"
              value={draft.address}
              onChange={(p) =>
                patch({ address: { ...draft.address, ...p } })
              }
            />
            <label className={checkCls}>
              <input
                type="checkbox"
                checked={draft.remit_different}
                onChange={(e) =>
                  patch({ remit_different: e.target.checked })
                }
              />
              Remit-to address is different
            </label>
            {draft.remit_different && (
              <AddressFields
                prefix="shipping"
                value={draft.remit_address}
                onChange={(p) =>
                  patch({
                    remit_address: { ...draft.remit_address, ...p },
                  })
                }
              />
            )}
          </section>

          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>4. Taxpayer ID</h2>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">TIN type</legend>
              <label className={checkCls}>
                <input
                  type="radio"
                  name="tin_type"
                  checked={draft.tin_type === 'ein'}
                  onChange={() => patch({ tin_type: 'ein' })}
                />
                EIN
              </label>
              <label className={checkCls}>
                <input
                  type="radio"
                  name="tin_type"
                  checked={draft.tin_type === 'ssn'}
                  onChange={() => patch({ tin_type: 'ssn' })}
                />
                SSN
              </label>
            </fieldset>
            <label className={labelCls}>
              {draft.tin_type === 'ein' ? 'Employer ID number *' : 'SSN *'}
              <input
                className={`${inputCls} avionic`}
                value={draft.tin}
                onChange={(e) => patch({ tin: e.target.value })}
                inputMode="numeric"
                autoComplete="off"
                placeholder={
                  draft.tin_type === 'ein' ? '12-3456789' : 'XXX-XX-XXXX'
                }
                required
              />
            </label>
            <p className={hintCls}>
              Used only for AP / 1099 setup. Our team verifies before paying.
            </p>
          </section>

          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>5. AP contact &amp; banking</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                AP contact name
                <input
                  className={inputCls}
                  value={draft.ap_name}
                  onChange={(e) => patch({ ap_name: e.target.value })}
                />
              </label>
              <label className={labelCls}>
                AP phone
                <input
                  className={inputCls}
                  value={draft.ap_phone}
                  onChange={(e) => patch({ ap_phone: e.target.value })}
                />
              </label>
            </div>
            <label className={labelCls}>
              AP email *
              <input
                type="email"
                className={inputCls}
                value={draft.ap_email}
                onChange={(e) => patch({ ap_email: e.target.value })}
                required
              />
            </label>
            <label className={labelCls}>
              Bank name
              <input
                className={inputCls}
                value={draft.bank_name}
                onChange={(e) => patch({ bank_name: e.target.value })}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                Routing number *
                <input
                  className={`${inputCls} avionic`}
                  value={draft.bank_routing}
                  onChange={(e) => patch({ bank_routing: e.target.value })}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                />
              </label>
              <label className={labelCls}>
                Account number *
                <input
                  className={`${inputCls} avionic`}
                  value={draft.bank_account}
                  onChange={(e) => patch({ bank_account: e.target.value })}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                />
              </label>
            </div>
            <fieldset className="flex flex-wrap gap-4">
              <legend className={labelCls}>Account type</legend>
              {ACCOUNT_TYPES.map((t) => (
                <label key={t} className={checkCls}>
                  <input
                    type="radio"
                    name="acct_type"
                    checked={draft.account_type === t}
                    onChange={() => patch({ account_type: t })}
                  />
                  {t === 'checking' ? 'Checking' : 'Savings'}
                </label>
              ))}
            </fieldset>
          </section>

          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>6. Signed W-9 (optional)</h2>
            <p className={hintCls}>
              Attach a signed IRS W-9 PDF if you have one. You can also mail it
              after submitting — we&apos;ll flag the gap.
            </p>
            <label className={labelCls}>
              Upload PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="mt-1.5 block w-full text-sm text-[#5c574c] file:mr-3 file:rounded-md file:border-0 file:bg-[#c9a227] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#0c0c0e]"
                onChange={(e) =>
                  patch({
                    w9_file_name: e.target.files?.[0]?.name ?? '',
                  })
                }
              />
            </label>
            {draft.w9_file_name && (
              <p className="text-sm text-[#2a2a2e]">
                Selected: <span className="avionic">{draft.w9_file_name}</span>
              </p>
            )}
          </section>

          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>7. Certification</h2>
            <p className={hintCls}>
              Under penalties of perjury, I certify that: (1) the number shown
              is my correct taxpayer ID; (2) I am not subject to backup
              withholding; (3) I am a U.S. citizen or other U.S. person; (4) the
              FATCA code(s) entered on this form (if any) indicating that I am
              exempt from FATCA reporting is correct.
            </p>
            <label className={checkCls}>
              <input
                type="checkbox"
                checked={draft.certified}
                onChange={(e) => patch({ certified: e.target.checked })}
                required
              />
              I certify the statements above are true *
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                Signer name *
                <input
                  className={inputCls}
                  value={draft.signer_name}
                  onChange={(e) => patch({ signer_name: e.target.value })}
                  required
                />
              </label>
              <label className={labelCls}>
                Title
                <input
                  className={inputCls}
                  value={draft.signer_title}
                  onChange={(e) => patch({ signer_title: e.target.value })}
                />
              </label>
            </div>
            <label className={labelCls}>
              Notes for OnFly AP
              <textarea
                className={`${inputCls} min-h-[88px]`}
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
          </section>

          {error && (
            <p className="rounded-md border border-[#c0392b]/40 bg-[#c0392b]/10 px-3 py-2 text-sm text-[#c0392b]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#c9a227] px-4 py-3 text-base font-semibold text-[#0c0c0e] hover:bg-[#e3b341] disabled:opacity-50 sm:w-auto"
          >
            {busy ? 'Submitting…' : 'Submit vendor packet'}
          </button>
        </form>
      </main>
    </div>
  )
}
