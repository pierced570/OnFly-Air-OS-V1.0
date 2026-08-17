/**
 * One-shot desk banners after Quick Dispatch navigates away (invoice may
 * still be in flight). Memory + sessionStorage when available.
 */

export type DeskFlash =
  | {
      kind: 'dispatch_complete'
      tripId: string
      po: string
      invoicePending: boolean
    }
  | {
      kind: 'invoice_failed'
      tripId: string
      po: string
      message: string
    }
  | {
      kind: 'invoice_sent'
      tripId: string
      po: string
      to: string[]
    }

const KEY = 'onfly_desk_flash'
let memory: DeskFlash | null = null

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

export function setDeskFlash(flash: DeskFlash): void {
  memory = flash
  try {
    storage()?.setItem(KEY, JSON.stringify(flash))
  } catch {
    /* private mode */
  }
}

/** Read and clear. */
export function takeDeskFlash(): DeskFlash | null {
  const fromMem = memory
  memory = null
  try {
    const raw = storage()?.getItem(KEY) ?? null
    storage()?.removeItem(KEY)
    if (raw) return JSON.parse(raw) as DeskFlash
  } catch {
    /* ignore */
  }
  return fromMem
}

/** Test helper */
export function __resetDeskFlashForTests(): void {
  memory = null
  try {
    storage()?.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
