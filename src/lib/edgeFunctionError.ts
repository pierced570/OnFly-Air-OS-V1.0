/**
 * Pull a human-readable message from supabase.functions.invoke failures.
 * Non-2xx responses often land as FunctionsHttpError with JSON in context/data.
 */

type EdgeBody = {
  error?: string
  detail?: unknown
  message?: string
  disabled?: boolean
}

function formatDetail(detail: unknown): string {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  if (typeof detail === 'object' && detail && 'message' in detail) {
    const m = (detail as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m
  }
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

function fromBody(body: EdgeBody | null | undefined): string | null {
  if (!body) return null
  const detail = formatDetail(body.detail)
  if (body.error && detail) return `${body.error}: ${detail}`
  if (body.error) return body.error
  if (body.message) return body.message
  if (detail) return detail
  return null
}

export async function messageFromEdgeInvoke(opts: {
  data: unknown
  error: { message?: string; context?: unknown } | null
  fallback: string
}): Promise<string> {
  const fromData = fromBody(opts.data as EdgeBody | null)
  if (fromData) return fromData

  const ctx = opts.error?.context as
    | { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } }
    | Response
    | null
    | undefined
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const raw =
        typeof (ctx as { clone?: () => Response }).clone === 'function'
          ? await (ctx as Response).clone().json()
          : await (ctx as Response).json()
      const fromCtx = fromBody(raw as EdgeBody)
      if (fromCtx) return fromCtx
    } catch {
      /* ignore */
    }
  }

  const msg = opts.error?.message?.trim()
  if (msg && msg !== 'Edge Function returned a non-2xx status code') return msg
  if (msg) return `${opts.fallback} (${msg})`
  return opts.fallback
}
