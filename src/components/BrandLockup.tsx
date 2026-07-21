import {
  BRAND_LOGO_LIGHT_PATH,
  BRAND_LOGO_PATH,
  BRAND_MARK_PATH,
  BRAND_TAGLINE,
} from '@/domain/brand'

type Props = {
  /**
   * `full` — light wordmark for cream/white forms & billing (default).
   * `mark` — mini aircraft-in-ring for nav / compact chrome.
   * `bar` — dark wordmark centered on ink (emails / dark strips).
   */
  variant?: 'full' | 'mark' | 'bar' | 'page'
  className?: string
  /** Show ASAP tagline under the logo (full/bar only). */
  showTagline?: boolean
}

/**
 * OnFly brand lockup.
 * Light full wordmark on cream forms; dark wordmark on ink bars; mark for chrome.
 */
export function BrandLockup({
  variant = 'full',
  className = '',
  showTagline = true,
}: Props) {
  const mode = variant === 'page' ? 'full' : variant

  if (mode === 'bar') {
    return (
      <div className={`bg-ink px-6 py-6 text-center ${className}`}>
        <img
          src={BRAND_LOGO_PATH}
          alt="OnFly Air"
          className="mx-auto h-14 w-auto max-w-[min(100%,280px)] object-contain"
        />
        {showTagline && (
          <div className="mt-3 text-[10px] font-semibold tracking-[0.18em] text-gold">
            {BRAND_TAGLINE}
          </div>
        )}
      </div>
    )
  }

  if (mode === 'mark') {
    return (
      <img
        src={BRAND_MARK_PATH}
        alt="OnFly Air"
        width={40}
        height={40}
        className={`h-10 w-10 shrink-0 object-contain ${className}`}
      />
    )
  }

  // full — cream/white forms & billing (dark FL so it never washes out)
  return (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      <img
        src={BRAND_LOGO_LIGHT_PATH}
        alt="OnFly Air"
        className="h-12 w-auto max-w-[min(100%,280px)] object-contain sm:h-14"
      />
      {showTagline && (
        <div className="text-[9px] font-semibold tracking-[0.14em] text-gold sm:text-[10px]">
          {BRAND_TAGLINE}
        </div>
      )}
    </div>
  )
}
