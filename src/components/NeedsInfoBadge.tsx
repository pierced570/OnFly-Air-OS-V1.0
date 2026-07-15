export function NeedsInfoBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs text-gold">
      NEEDS-INFO
      <span className="avionic opacity-80">{count}</span>
    </span>
  )
}
