/**
 * Browser Supabase client helpers for real operating data.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export function db() {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }
  return supabase
}

export function canPersist(): boolean {
  return isSupabaseConfigured
}

export async function safeQuery<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  try {
    const { data, error } = await fn()
    if (error) {
      console.warn(`[db] ${label}:`, error.message)
      return null
    }
    return data
  } catch (e) {
    console.warn(`[db] ${label}:`, e)
    return null
  }
}
