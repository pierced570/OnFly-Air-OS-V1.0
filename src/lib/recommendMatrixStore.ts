/**
 * Recommendation matrix store — editable scoring knobs for new-request
 * operator search (New trip + Network → Recommend). Other flows use builtins.
 */

import {
  BUILTIN_RECOMMEND_MATRIX,
  sanitizeRecommendMatrix,
  type RecommendMatrixConfig,
} from '@/domain/recommendMatrix'

const STORAGE_KEY = 'onfly.recommend_matrix.v1'

let cached: RecommendMatrixConfig = { ...BUILTIN_RECOMMEND_MATRIX }
const listeners = new Set<() => void>()

function bump() {
  for (const l of listeners) l()
}

function loadLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<RecommendMatrixConfig>
    cached = sanitizeRecommendMatrix(parsed)
  } catch {
    /* ignore */
  }
}

function persistLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
  } catch {
    /* ignore */
  }
}

loadLocal()

export function subscribeRecommendMatrix(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getRecommendMatrix(): RecommendMatrixConfig {
  return cached
}

export function setRecommendMatrix(
  patch: Partial<RecommendMatrixConfig>,
): RecommendMatrixConfig {
  cached = sanitizeRecommendMatrix({ ...cached, ...patch })
  persistLocal()
  bump()
  void flushRecommendMatrixToDb()
  return cached
}

export function setRecommendMatrixField<K extends keyof RecommendMatrixConfig>(
  key: K,
  value: RecommendMatrixConfig[K],
): RecommendMatrixConfig {
  return setRecommendMatrix({ [key]: value } as Partial<RecommendMatrixConfig>)
}

export function resetRecommendMatrix(): RecommendMatrixConfig {
  cached = { ...BUILTIN_RECOMMEND_MATRIX }
  persistLocal()
  bump()
  void flushRecommendMatrixToDb()
  return cached
}

async function flushRecommendMatrixToDb(): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    const rows = (Object.keys(cached) as (keyof RecommendMatrixConfig)[]).map(
      (key) => ({
        key,
        value: cached[key],
        updated_at: new Date().toISOString(),
      }),
    )
    await supabase.from('recommend_matrix').upsert(rows, { onConflict: 'key' })
  } catch (e) {
    console.warn('[recommend_matrix] persist failed', e)
  }
}

export async function hydrateRecommendMatrixFromDb(): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    const { data, error } = await supabase
      .from('recommend_matrix')
      .select('key, value')
    if (error || !data?.length) return
    const patch: Partial<RecommendMatrixConfig> = {}
    for (const row of data) {
      const k = row.key as keyof RecommendMatrixConfig
      if (k in BUILTIN_RECOMMEND_MATRIX && row.value != null) {
        patch[k] = Number(row.value) as RecommendMatrixConfig[typeof k]
      }
    }
    cached = sanitizeRecommendMatrix({ ...cached, ...patch })
    persistLocal()
    bump()
  } catch (e) {
    console.warn('[recommend_matrix] hydrate failed', e)
  }
}

export function __resetRecommendMatrixForTests(): void {
  cached = { ...BUILTIN_RECOMMEND_MATRIX }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}
