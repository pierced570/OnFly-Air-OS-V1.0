import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'

type WizardKind = 'operator' | 'client' | 'fbo'

const identitySchema = z.object({
  name: z.string().min(2),
  base_icao: z.string().optional(),
})

export default function AdminPage() {
  const [kind, setKind] = useState<WizardKind>('operator')
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [base, setBase] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])
  const [tasks, setTasks] = useState<Array<{ field: string; note: string }>>([])

  const steps =
    kind === 'operator'
      ? ['Identity', 'Contacts', 'Capabilities', 'D085', 'Insurance', 'Rates', 'Summary']
      : kind === 'client'
        ? ['Company', 'Crew rule', 'Payload', 'Aircraft', 'Hazmat', 'People', 'Summary']
        : ['Airport', 'Hours', 'Forklift', 'Fees', 'Summary']

  const completeness = useMemo(() => {
    const filled = name.trim() ? 1 : 0
    const total = 4
    const skipPenalty = skipped.length * 0.05
    return Math.max(0, Math.min(100, Math.round(((filled + (base ? 1 : 0)) / total) * 100 - skipPenalty * 100)))
  }, [name, base, skipped])

  function skip(field: string) {
    setSkipped((s) => [...s, field])
    setTasks((t) => [...t, { field, note: `Collect ${field}` }])
    setStep((x) => Math.min(x + 1, steps.length - 1))
  }

  function next() {
    if (step === 0) {
      const parsed = identitySchema.safeParse({ name, base_icao: base })
      if (!parsed.success) return
    }
    setStep((x) => Math.min(x + 1, steps.length - 1))
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Admin wizards</h1>
        <p className="mt-1 text-sm text-muted">Approve/adjust interviews — never blank tables</p>
      </header>

      <div className="flex gap-2">
        {(['operator', 'client', 'fbo'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k)
              setStep(0)
            }}
            className={[
              'rounded-md px-3 py-1.5 text-sm capitalize',
              kind === k ? 'bg-gold text-ink' : 'bg-surface text-muted',
            ].join(' ')}
          >
            Add {k}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <span
                key={s}
                className={[
                  'rounded-full px-2 py-0.5 text-xs',
                  i === step ? 'bg-gold text-ink' : i < step ? 'bg-onplan/20 text-onplan' : 'bg-surface-2 text-muted',
                ].join(' ')}
              >
                {s}
              </span>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-3">
              <label className="block text-sm text-muted">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-ink px-3 py-2 text-cream"
                />
              </label>
              {kind !== 'client' && (
                <label className="block text-sm text-muted">
                  Base / ICAO
                  <input
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-ink px-3 py-2 text-cream avionic"
                  />
                </label>
              )}
            </div>
          )}

          {step > 0 && step < steps.length - 1 && (
            <div className="space-y-3 text-sm text-muted">
              <p>
                Step <span className="text-cream">{steps[step]}</span> — stub fields for Chunk 6. Skip writes
                NEEDS-INFO tasks.
              </p>
              {kind === 'operator' && step === 3 && (
                <div className="rounded border border-dashed border-border p-4">
                  D085 upload → parse tails → type_specs prefill (edge `parse-d085`). Mock: drop PDF later.
                </div>
              )}
            </div>
          )}

          {step === steps.length - 1 && (
            <div>
              <p className="text-cream">Completeness {completeness}%</p>
              <ul className="mt-2 text-sm text-gold">
                {tasks.map((t) => (
                  <li key={t.field}>NEEDS-INFO: {t.note}</li>
                ))}
                {tasks.length === 0 && <li className="text-muted">No open tasks</li>}
              </ul>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-sm text-muted"
              onClick={() => setStep((x) => Math.max(0, x - 1))}
            >
              Back
            </button>
            {step < steps.length - 1 && (
              <>
                <button
                  type="button"
                  className="rounded border border-gold/40 px-3 py-1.5 text-sm text-gold"
                  onClick={() => skip(steps[step]!.toLowerCase())}
                >
                  Skip → task
                </button>
                <button
                  type="button"
                  className="rounded bg-gold px-3 py-1.5 text-sm font-medium text-ink"
                  onClick={next}
                >
                  Continue
                </button>
              </>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Completeness</div>
          <div
            className="mt-3 flex h-28 w-28 items-center justify-center rounded-full border-4 border-gold text-xl text-gold"
            style={{ boxShadow: `inset 0 0 0 ${Math.round((100 - completeness) / 4)}px #141414` }}
          >
            {completeness}%
          </div>
          <LinkTasks />
        </aside>
      </div>
    </div>
  )
}

function LinkTasks() {
  return (
    <Link to="/admin/tasks" className="mt-4 block text-xs text-gold">
      Open NEEDS-INFO tasks →
    </Link>
  )
}
