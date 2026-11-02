/**
 * Client app — Account. View + edit company desk info. Never desk staff login.
 */

import { useEffect, useState, type FormEvent, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalShell } from '@/components/PortalShell'
import { PortalGuestContinue } from '@/components/PortalGuestContinue'
import { PortalQuickActions } from '@/components/PortalQuickActions'
import PhoneInput from '@/components/PhoneInput'
import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'
import { usePortalSession } from '@/hooks/usePortalSession'
import { endPortalSession } from '@/lib/portalAuth'
import { getPortalClient } from '@/lib/clientOnboardStore'
import {
  getClient,
  listClients,
  subscribeClients,
  updateClient,
} from '@/lib/clientStore'

export default function PortalAccountPage() {
  useSyncExternalStore(subscribeClients, listClients, listClients)
  const { session, loading, signedIn, setSession } = usePortalSession()
  const client = getPortalClient()

  const [companyName, setCompanyName] = useState('')
  const [deskPhone, setDeskPhone] = useState('')
  const [callbackPhone, setCallbackPhone] = useState('')
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return
    setCompanyName(client.name ?? '')
    setDeskPhone(client.profile.front_desk_phone ?? '')
    setCallbackPhone(client.profile.ops_callback_phone ?? '')
    setInvoiceEmail(client.invoice_email || client.email || '')
  }, [client?.id, client?.name, client?.invoice_email, client?.email, client?.profile.front_desk_phone, client?.profile.ops_callback_phone])

  if (loading) {
    return (
      <PortalShell>
        <p className="text-sm text-muted">Checking session…</p>
      </PortalShell>
    )
  }

  if (!signedIn) {
    return (
      <PortalGuestContinue
        title="Sign in for account"
        hint="Company profile and sign-out need a verified desk email. Requesting a trip never requires an account."
        nextHref="/portal/account"
      />
    )
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!client) {
      setError('No company profile linked to this email yet.')
      return
    }
    const name = companyName.trim()
    if (!name) {
      setError('Company name is required.')
      return
    }
    const updated = updateClient(client.id, {
      name,
      invoice_email: invoiceEmail.trim(),
      profile: {
        ...client.profile,
        front_desk_phone: deskPhone.trim(),
        ops_callback_phone: callbackPhone.trim(),
      },
    })
    if (!updated) {
      setError('Could not save — try again.')
      return
    }
    // Ensure portal client pointer still resolves after edit
    getClient(client.id)
    setSaved(true)
  }

  return (
    <PortalShell
      appNav
      headerActions={
        <button
          type="button"
          className="text-gold hover:text-gold-lt"
          onClick={() => {
            void endPortalSession().then(() => setSession(null))
          }}
        >
          Sign out
        </button>
      }
    >
      <section className="space-y-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Account
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {client?.name?.trim() || 'Your company'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as{' '}
            <span className="font-medium text-ink">{session?.email}</span> —
            edit desk details below. Dispatch logins are separate.
          </p>
        </div>

        <form
          onSubmit={onSave}
          className="portal-glass-strong space-y-4 rounded-2xl p-5 sm:p-6"
        >
          <h2 className="text-sm font-semibold text-ink">Company profile</h2>

          <label className="block text-xs font-medium text-muted">
            Company name
            <input
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value)
                setSaved(false)
              }}
              className="portal-glass-input mt-1 w-full rounded-xl px-3 py-3 text-sm text-ink outline-none"
              required
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-muted">
              Front desk phone
              <PhoneInput
                value={deskPhone}
                onChange={(v) => {
                  setDeskPhone(v)
                  setSaved(false)
                }}
                className="portal-glass-input mt-1 w-full rounded-xl px-3 py-3 font-mono text-sm text-ink outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Ops callback phone
              <PhoneInput
                value={callbackPhone}
                onChange={(v) => {
                  setCallbackPhone(v)
                  setSaved(false)
                }}
                className="portal-glass-input mt-1 w-full rounded-xl px-3 py-3 font-mono text-sm text-ink outline-none"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-muted">
            Invoice email
            <input
              type="email"
              value={invoiceEmail}
              onChange={(e) => {
                setInvoiceEmail(e.target.value)
                setSaved(false)
              }}
              className="portal-glass-input mt-1 w-full rounded-xl px-3 py-3 text-sm text-ink outline-none"
              placeholder="ap@company.com"
            />
          </label>

          <div className="rounded-xl border border-ink/10 bg-white/30 px-3 py-2.5 text-xs text-muted">
            Sign-in email is fixed to{' '}
            <span className="font-medium text-ink">{session?.email}</span>.
            Contact OnFly to change portal access emails.
          </div>

          {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}
          {saved ? (
            <p className="text-sm font-medium text-[#2E7D32]">Saved.</p>
          ) : null}

          <button
            type="submit"
            disabled={!client}
            className="inline-flex min-h-11 items-center rounded-xl bg-gold px-5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
          >
            Save changes
          </button>
        </form>

        <PortalQuickActions compact />

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/portal/history"
            className="portal-glass-row inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink"
          >
            Trips, POs &amp; invoices
          </Link>
          <a
            href={`mailto:${BRAND_EMAIL}`}
            className="portal-glass-row inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink"
          >
            Email {BRAND_EMAIL}
          </a>
        </div>

        <button
          type="button"
          className="w-full min-h-12 rounded-xl text-sm font-semibold text-[#C0392B]"
          onClick={() => {
            void endPortalSession().then(() => setSession(null))
          }}
        >
          Sign out
        </button>

        <p className="text-center text-xs text-muted">
          24-hr ops · <span className="avionic text-gold">{BRAND_PHONE}</span>
        </p>
      </section>
    </PortalShell>
  )
}
