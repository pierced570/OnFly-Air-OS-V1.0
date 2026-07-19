/**
 * Supabase Storage helpers — operator docs + trip artifacts.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export const OPERATOR_DOCS_BUCKET = 'operator-docs'
export const TRIP_DOCS_BUCKET = 'trip-docs'

export function canUseStorage(): boolean {
  return isSupabaseConfigured && Boolean(supabase)
}

export function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120)
}

export type StorageUploadResult = {
  bucket: string
  path: string
  signedUrl: string | null
}

/** Upload operator compliance file → operator-docs/{operatorId}/{kind}/{ts}_{name} */
export async function uploadOperatorDocToStorage(opts: {
  operatorId: string
  kind: string
  file: File
}): Promise<StorageUploadResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const safe = sanitizeFileName(opts.file.name || 'document.pdf')
  const path = `${opts.operatorId}/${opts.kind}/${Date.now()}_${safe}`
  const { error } = await supabase.storage
    .from(OPERATOR_DOCS_BUCKET)
    .upload(path, opts.file, {
      upsert: true,
      contentType: opts.file.type || 'application/octet-stream',
    })
  if (error) throw error
  const signedUrl = await createSignedUrl(OPERATOR_DOCS_BUCKET, path)
  return { bucket: OPERATOR_DOCS_BUCKET, path, signedUrl }
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresSec = 60 * 60 * 24 * 7,
): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresSec)
  if (error) {
    console.warn('[storage] signed URL failed', error.message)
    return null
  }
  return data.signedUrl
}

export async function uploadTripDocToStorage(opts: {
  tripId: string
  kind: string
  file: File
}): Promise<StorageUploadResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const safe = sanitizeFileName(opts.file.name || 'document.pdf')
  const path = `${opts.tripId}/${opts.kind}/${Date.now()}_${safe}`
  const { error } = await supabase.storage.from(TRIP_DOCS_BUCKET).upload(path, opts.file, {
    upsert: true,
    contentType: opts.file.type || 'application/octet-stream',
  })
  if (error) throw error
  const signedUrl = await createSignedUrl(TRIP_DOCS_BUCKET, path)
  return { bucket: TRIP_DOCS_BUCKET, path, signedUrl }
}
