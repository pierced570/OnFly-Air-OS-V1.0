/**
 * Adapter pattern stub (Chunk 1).
 * Every external service: interface + mock + real, selected by env.
 * Domain/UI never import provider SDKs directly.
 */

export type AdapterMode = 'mock' | 'real'

export function adapterMode(envKey: string, fallback: AdapterMode = 'mock'): AdapterMode {
  const v = (import.meta.env[envKey] as string | undefined)?.toLowerCase()
  return v === 'real' ? 'real' : fallback
}
