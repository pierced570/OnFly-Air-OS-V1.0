import type { ReactNode } from 'react'

type Props = {
  title: string
  steps: string[]
  step: number
  completeness: number
  onBack: () => void
  onSkip?: () => void
  onNext: () => void
  isLast: boolean
  nextLabel?: string
  children: ReactNode
  aside?: ReactNode
}

export function WizardShell({
  title,
  steps,
  step,
  completeness,
  onBack,
  onSkip,
  onNext,
  isLast,
  nextLabel = 'Continue',
  children,
  aside,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-cream">{title}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <span
              key={s}
              className={[
                'rounded-full px-2 py-0.5 text-xs',
                i === step
                  ? 'bg-gold text-ink'
                  : i < step
                    ? 'bg-onplan/20 text-onplan'
                    : 'bg-surface-2 text-muted',
              ].join(' ')}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="mt-5 space-y-3">{children}</div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-sm text-muted"
            onClick={onBack}
            disabled={step === 0}
          >
            Back
          </button>
          {!isLast && onSkip && (
            <button
              type="button"
              className="rounded border border-gold/40 px-3 py-1.5 text-sm text-gold"
              onClick={onSkip}
            >
              Skip → task
            </button>
          )}
          <button
            type="button"
            className="rounded bg-gold px-3 py-1.5 text-sm font-medium text-ink"
            onClick={onNext}
          >
            {isLast ? nextLabel : 'Continue'}
          </button>
        </div>
      </section>
      <aside className="rounded-lg border border-border bg-surface p-4">
        <div className="text-xs uppercase tracking-wider text-muted">Completeness</div>
        <div className="mt-3 flex h-28 w-28 items-center justify-center rounded-full border-4 border-gold text-xl text-gold">
          {completeness}%
        </div>
        {aside}
      </aside>
    </div>
  )
}

export const wizardInput =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
export const wizardLabel = 'block text-xs font-medium uppercase tracking-wider text-muted'
