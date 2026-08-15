/**
 * Cream read-only card — what the operator sees when they reopen their
 * magic link after submitting (or after stand-down).
 */

import { BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import {
  buildOfferMissionBadges,
  offerLaneTitle,
} from '@/domain/offerMissionDisplay'
import type { OperatorSubmittedQuoteSnapshot } from '@/domain/operatorSubmittedQuote'

type Props = {
  lane: string
  tripCode?: string
  payloadSummary?: string
  readyLabel?: string
  liveNm?: number | null
  snapshot: OperatorSubmittedQuoteSnapshot
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 text-sm leading-snug sm:grid-cols-[8.5rem_1fr]">
      <div className="text-[#6F675C]">{label}</div>
      <div className={mono ? 'avionic text-ink' : 'text-ink'}>{value}</div>
    </div>
  )
}

export function OperatorSubmittedQuoteView({
  lane,
  tripCode,
  payloadSummary,
  readyLabel,
  liveNm,
  snapshot,
}: Props) {
  const title = offerLaneTitle({
    lane,
    payload_summary: payloadSummary ?? '',
  })
  const badges = buildOfferMissionBadges({
    lane,
    payload_summary: payloadSummary ?? '',
    ready_label: readyLabel ?? '',
    nm: liveNm,
  })
  const code = (tripCode || '').trim() || 'QUOTE'

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4DDD0] bg-white shadow-sm">
      <header className="bg-[#141414] px-5 pb-6 pt-5 text-cream sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <img
            src={BRAND_LOGO_PATH}
            alt="OnFly Air"
            className="h-8 w-auto object-contain sm:h-9"
          />
          <span className="avionic rounded-full border border-gold/50 px-2.5 py-1 text-[10px] tracking-wide text-gold">
            QUOTE ON FILE · {code}
          </span>
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((b) => (
            <span
              key={b.label}
              className={[
                'avionic rounded-full px-2.5 py-1 text-[10px] tracking-wide',
                b.emphasis === 'gold'
                  ? 'border border-gold/50 text-gold'
                  : 'bg-[#0C0C0E] text-cream/85',
              ].join(' ')}
            >
              {b.label}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-cream/75">
          Questions? 24-hr ops{' '}
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="font-semibold text-gold"
          >
            {BRAND_PHONE}
          </a>
          .
        </p>
      </header>

      <div className="space-y-5 px-5 py-6 text-ink sm:px-6">
        <div>
          <h2 className="text-xl font-semibold">{snapshot.headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6F675C]">
            {snapshot.blurb}
          </p>
        </div>

        <section className="space-y-2 rounded-xl border border-[#E4DDD0] bg-[#F9F7F2] px-4 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6F675C]">
            What you submitted
          </div>
          {snapshot.type_name ? (
            <Row label="Aircraft" value={snapshot.type_name} />
          ) : null}
          {snapshot.tail ? (
            <Row label="Tail" value={snapshot.tail} mono />
          ) : null}
          <Row label="NET" value={snapshot.price_label} mono />
          {snapshot.ttp_label ? (
            <Row label="TTP" value={snapshot.ttp_label} mono />
          ) : null}
          {snapshot.turn_label ? (
            <Row label="Turn" value={snapshot.turn_label} mono />
          ) : null}
          {snapshot.live_label ? (
            <Row label="Live leg" value={snapshot.live_label} mono />
          ) : null}
          {snapshot.fee_label ? (
            <Row label="Fees" value={snapshot.fee_label} />
          ) : null}
          {snapshot.notes ? (
            <Row label="Notes" value={snapshot.notes} />
          ) : null}
        </section>
      </div>
    </div>
  )
}
