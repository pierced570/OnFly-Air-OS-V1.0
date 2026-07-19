import { useState, type FormEvent } from 'react'
import PhoneInput from '@/components/PhoneInput'
import { loginStaff } from '@/lib/staffStore'

export default function StaffLoginPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = loginStaff(name, phone)
    if (!result.ok) setError(result.error)
    setBusy(false)
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 text-cream"
      data-theme="dispatcher"
    >
      <div className="w-full max-w-sm">
        <div className="text-[10px] uppercase tracking-[0.25em] text-gold">
          OnFly Air
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-cream">
          Dispatch OS
        </h1>
        <p className="mt-2 text-sm text-muted">
          Enter your name and phone to open the desk. Access is limited to the
          sections your admin assigned.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-xs text-muted">
            Name
            <input
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-cream outline-none focus:border-gold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              placeholder="First Last"
            />
          </label>
          <label className="block text-xs text-muted">
            Phone
            <PhoneInput
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm text-cream outline-none focus:border-gold"
              value={phone}
              onChange={setPhone}
              required
            />
          </label>
          {error && <p className="text-sm text-late">{error}</p>}
          <button
            type="submit"
            disabled={busy || !name.trim() || phone.length < 10}
            className="w-full rounded-md bg-gold py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Enter'}
          </button>
        </form>

        <p className="mt-6 text-[11px] leading-relaxed text-muted">
          Owner: Pierce Demetriades · (610) 509-2031. After you sign in, use
          Staff access to set phones and choose what each person can see.
        </p>
      </div>
    </div>
  )
}
