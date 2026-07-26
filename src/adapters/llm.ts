/**
 * LLM adapter — mock canned extract or Claude via edge `llm-extract`.
 * ANTHROPIC_API_KEY lives in Supabase secrets only (never VITE_*).
 *
 * Desk call-pad: Claude reviews freeform notes (any formatting) and plugs
 * fields; local heuristics fill gaps when Claude is thin or unavailable.
 */

import { adapterMode } from '@/adapters/types'
import {
  mergeTripExtract,
  normalizeTripExtract,
  type NormalizedTripExtract,
} from '@/domain/normalizeExtract'
import { extractFromScratchNotes } from '@/domain/scratchParse'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type ExtractedRequest = NormalizedTripExtract

export type D085ExtractRow = {
  tail: string
  type_name: string
}

export interface LlmAdapter {
  extractTripRequest(rawText: string): Promise<ExtractedRequest>
  /** Plain-English NOTAM / briefing helper */
  plainEnglish(text: string, context?: string): Promise<string>
  /** Parse D085 / ops specs listing → aircraft rows for human verify */
  extractD085(rawText: string): Promise<D085ExtractRow[]>
}

/** @deprecated use mergeTripExtract — kept for existing imports/tests */
export function mergeScratchExtract(
  primary: ExtractedRequest,
  fallback: ExtractedRequest,
): ExtractedRequest {
  return mergeTripExtract(primary, fallback)
}

function heuristicExtract(rawText: string): ExtractedRequest {
  const parsed = extractFromScratchNotes(rawText)
  return {
    ...normalizeTripExtract(parsed, rawText),
    parse_source: 'heuristic',
    notes: parsed.notes || 'heuristic extract',
  }
}

function hintsForClaude(h: ExtractedRequest): Record<string, unknown> {
  return {
    client_name: h.client_name ?? null,
    origin_text: h.origin_text ?? null,
    destination_text: h.destination_text ?? null,
    pieces_text: h.pieces_text ?? null,
    asap: h.asap ?? null,
    hazmat: h.hazmat ?? null,
    pax_count: h.pax_count ?? null,
    payload_kind: h.payload_kind ?? null,
    ready_local: h.ready_local ?? null,
  }
}

export class MockLlmAdapter implements LlmAdapter {
  async extractTripRequest(rawText: string): Promise<ExtractedRequest> {
    if (!rawText.trim()) {
      return {
        client_name: 'Demo MRO',
        pieces_text: '1 skid 48x40x60 @ 800ea',
        origin_text: 'KCAK',
        destination_text: 'KMDW',
        asap: true,
        payload_kind: 'cargo',
        hazmat: false,
        notes: 'empty scratch — demo seed',
        raw: rawText,
        parse_source: 'demo',
      }
    }
    // Mock = local heuristics (Claude path is real adapter)
    return heuristicExtract(rawText)
  }

  async plainEnglish(text: string, _context?: string): Promise<string> {
    const clipped = text.trim().slice(0, 280)
    return clipped
      ? `Mock plain English: ${clipped}`
      : 'Mock plain English: (empty)'
  }

  async extractD085(rawText: string): Promise<D085ExtractRow[]> {
    const tails =
      rawText.match(/\bN[0-9]{1,5}[A-Z]{0,2}\b/gi) ??
      ['N123AB', 'N456CD', 'N789EF']
    const uniq = [...new Set(tails.map((t) => t.toUpperCase()))]
    return uniq.slice(0, 12).map((tail, i) => ({
      tail,
      type_name:
        i === 0 ? 'King Air 200' : i === 1 ? 'Cessna 208' : 'Unknown Type',
    }))
  }
}

/** Real path → edge `llm-extract` (Claude when ANTHROPIC_API_KEY is set). */
export class ClaudeLlmAdapter implements LlmAdapter {
  async extractTripRequest(rawText: string): Promise<ExtractedRequest> {
    // Keep full pad text (unicode dashes, bullets, etc.) — only skip empty pads.
    const heuristic = heuristicExtract(rawText)
    if (!rawText.trim()) return heuristic

    if (!supabase || !isSupabaseConfigured) {
      throw new Error(
        'LLM real mode needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY',
      )
    }
    try {
      const { data, error } = await supabase.functions.invoke('llm-extract', {
        body: {
          mode: 'extract_scratch',
          text: rawText,
          hints: hintsForClaude(heuristic),
        },
      })
      if (error) throw new Error(error.message || 'llm-extract failed')
      const body = data as Record<string, unknown> & { error?: string }
      if (body?.error) throw new Error(body.error)
      const claude = normalizeTripExtract(body, rawText)
      const merged = mergeTripExtract(claude, heuristic)
      return {
        ...merged,
        parse_source: merged.parse_source ?? 'claude',
      }
    } catch (e) {
      console.warn('[llm] Claude scratch review failed — heuristic only', e)
      return {
        ...heuristic,
        notes: [heuristic.notes, 'claude_unavailable'].filter(Boolean).join('; '),
        parse_source: 'heuristic',
      }
    }
  }

  async plainEnglish(text: string, context?: string): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      return new MockLlmAdapter().plainEnglish(text, context)
    }
    const { data, error } = await supabase.functions.invoke('llm-extract', {
      body: { mode: 'plain_english', text, context },
    })
    if (error) throw new Error(error.message || 'llm-extract failed')
    const body = data as { text?: string; error?: string }
    if (body?.error) throw new Error(body.error)
    return body.text ?? ''
  }

  async extractD085(rawText: string): Promise<D085ExtractRow[]> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(
        'LLM real mode needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY',
      )
    }
    const { data, error } = await supabase.functions.invoke('llm-extract', {
      body: { mode: 'extract_d085', text: rawText },
    })
    if (error) throw new Error(error.message || 'llm-extract failed')
    const body = data as {
      aircraft?: D085ExtractRow[]
      error?: string
    }
    if (body?.error) throw new Error(body.error)
    return Array.isArray(body?.aircraft) ? body.aircraft : []
  }
}

/** @deprecated alias — real LLM is Claude via llm-extract */
export const OpenAiLlmAdapter = ClaudeLlmAdapter

export function createLlmAdapter(): LlmAdapter {
  const mode = adapterMode('VITE_LLM_ADAPTER', 'real')
  if (mode === 'real' && isSupabaseConfigured) return new ClaudeLlmAdapter()
  if (mode === 'real' && !isSupabaseConfigured) {
    console.warn('[llm] real mode needs Supabase — using mock extract')
  }
  return new MockLlmAdapter()
}

export function isRealLlmEnabled(): boolean {
  return (
    adapterMode('VITE_LLM_ADAPTER', 'real') === 'real' && isSupabaseConfigured
  )
}
