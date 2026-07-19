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
        <p className="mt-2 text-xs text-muted sm:hidden">
          Step {step + 1}/{steps.length} · {steps[step]}
        </p>
        <div className="mt-4 hidden flex-wrap gap-2 sm:flex">
          {steps.map((s, i) => (
            <span
              key={s}
              className={[
                'rounded-md px-2.5 py-1 text-xs',
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
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="min-h-11 rounded border border-border px-4 py-2.5 text-sm text-muted sm:min-h-0 sm:py-1.5"
            onClick={onBack}
            disabled={step === 0}
          >
            Back
          </button>
          {!isLast && onSkip && (
            <button
              type="button"
              className="min-h-11 rounded border border-gold/40 px-4 py-2.5 text-sm text-gold sm:min-h-0 sm:py-1.5"
              onClick={onSkip}
            >
              Skip → task
            </button>
          )}
          <button
            type="button"
            className="min-h-11 rounded bg-gold px-4 py-2.5 text-sm font-medium text-ink sm:min-h-0 sm:py-1.5"
            onClick={onNext}
          >
            {isLast ? nextLabel : 'Continue'}
          </button>
        </div>
      </section>
      <aside className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 sm:block">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">
            Completeness
          </div>
          <div className="mt-2 flex h-16 w-16 items-center justify-center rounded-full border-4 border-gold text-lg text-gold sm:mt-3 sm:h-28 sm:w-28 sm:text-xl">
            {completeness}%
          </div>
        </div>
        {aside}
      </aside>
    </div>
  )
}

export const wizardInput =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
export const wizardLabel = 'block text-xs font-medium uppercase tracking-wider text-muted'
