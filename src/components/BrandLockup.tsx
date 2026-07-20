import { BRAND_TAGLINE } from '@/domain/clientInviteEmail'

type Props = {
  /** Dark ink bar (email-style) vs cream page header */
  variant?: 'bar' | 'page'
  className?: string
}

/** OnFly mark + ONFLY Air wordmark + ASAP tagline. */
export function BrandLockup({ variant = 'page', className = '' }: Props) {
  if (variant === 'bar') {
    return (
      <div className={`bg-ink px-6 py-6 text-center ${className}`}>
        <img
          src="/brand/onfly-mark.svg"
          alt="OnFly Air"
          width={56}
          height={56}
          className="mx-auto mb-3 rounded-[10px]"
        />
        <div className="text-[1.65rem] font-bold tracking-[0.06em]">
          <span className="text-cream">ONFLY</span>
          <span className="text-gold"> Air</span>
        </div>
        <div className="mt-2 text-[10px] font-semibold tracking-[0.18em] text-gold">
          {BRAND_TAGLINE}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/brand/onfly-mark.svg"
        alt=""
        width={40}
        height={40}
        className="shrink-0 rounded-lg"
      />
      <div>
        <div className="text-lg font-bold tracking-[0.04em] text-ink">
          ONFLY<span className="text-gold"> Air</span>
        </div>
        <div className="text-[9px] font-semibold tracking-[0.14em] text-gold">
          {BRAND_TAGLINE}
        </div>
      </div>
    </div>
  )
}
