/**
 * Keyword parse for trip-thread actuals (regex path; LLM later).
 */

export type ParsedActual =
  | { kind: 'wheels_up'; confidence: number }
  | { kind: 'wheels_down'; confidence: number }
  | { kind: 'arrived'; confidence: number }
  | { kind: 'loaded'; confidence: number }
  | { kind: 'delivered'; confidence: number }
  | { kind: 'en_route'; confidence: number }
  | { kind: 'eta_relative'; minutes: number; confidence: number }
  | { kind: 'unknown'; confidence: 0 }

export function parseThreadActual(body: string): ParsedActual {
  const t = body.toLowerCase()
  if (/wheels\s*up|airborne|departed/.test(t)) return { kind: 'wheels_up', confidence: 0.95 }
  if (/wheels\s*down|landed|on the ground/.test(t)) return { kind: 'wheels_down', confidence: 0.95 }
  if (/handed\s*off|delivered|pod\b/.test(t)) return { kind: 'delivered', confidence: 0.9 }
  if (/loaded|loading complete/.test(t)) return { kind: 'loaded', confidence: 0.9 }
  if (/arrived|on site|at the fbo/.test(t)) return { kind: 'arrived', confidence: 0.85 }
  if (/leaving|en\s*route/.test(t)) return { kind: 'en_route', confidence: 0.8 }
  const rel = t.match(/in\s+(\d+)\s*(hrs?|hours?|mins?|minutes?)/)
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2]
    const minutes = /hr/.test(unit) ? n * 60 : n
    return { kind: 'eta_relative', minutes, confidence: 0.75 }
  }
  return { kind: 'unknown', confidence: 0 }
}
