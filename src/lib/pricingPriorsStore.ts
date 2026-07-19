/**
 * pricing_priors view — median $/NM by type (and optional operator).
 */

import { canPersist, db, safeQuery } from '@/lib/db/client'

export type PricingPrior = {
  type_name: string | null
  operator_id: string | null
  n: number
  avg_op_per_nm: number | null
  med_op_per_nm: number | null
}

let cached: PricingPrior[] = []
let loaded = false

export async function loadPricingPriors(): Promise<PricingPrior[]> {
  if (loaded) return cached
  if (!canPersist()) {
    loaded = true
    return cached
  }
  const rows = await safeQuery('pricing_priors', () =>
    db()
      .from('pricing_priors')
      .select('type_name,operator_id,n,avg_op_per_nm,med_op_per_nm'),
  )
  if (Array.isArray(rows)) {
    cached = rows.map((r: Record<string, unknown>) => ({
      type_name: r.type_name == null ? null : String(r.type_name),
      operator_id: r.operator_id == null ? null : String(r.operator_id),
      n: Number(r.n ?? 0),
      avg_op_per_nm:
        r.avg_op_per_nm == null ? null : Number(r.avg_op_per_nm),
      med_op_per_nm:
        r.med_op_per_nm == null ? null : Number(r.med_op_per_nm),
    }))
  }
  loaded = true
  return cached
}

export function getPricingPriors(): PricingPrior[] {
  return cached
}

/** Lookup median $/NM — prefer operator+type, else type-only. */
export function priorRatePerNm(
  typeName: string | null | undefined,
  operatorId: string | null | undefined,
  priors: PricingPrior[] = cached,
): number | null {
  if (!priors.length || !typeName) return null
  const opHit = operatorId
    ? priors.find(
        (p) =>
          p.operator_id === operatorId &&
          p.type_name === typeName &&
          p.med_op_per_nm != null &&
          p.n >= 1,
      )
    : null
  if (opHit?.med_op_per_nm != null) return opHit.med_op_per_nm
  const typeHit = priors.find(
    (p) =>
      p.operator_id == null &&
      p.type_name === typeName &&
      p.med_op_per_nm != null &&
      p.n >= 1,
  )
  return typeHit?.med_op_per_nm ?? null
}

export function __resetPricingPriorsForTests(): void {
  cached = []
  loaded = false
}
