/**
 * LLM adapter — mock canned extract or Claude via edge `llm-extract`.
 * ANTHROPIC_API_KEY lives in Supabase secrets only (never VITE_*).
 */

import { adapterMode } from '@/adapters/types'
import {
  applyOperatorScratchDefaults,
  extractFromScratchNotes,
} from '@/domain/scratchParse'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type ExtractedRequest = {
  pieces_text?: string
  origin_text?: string
  destination_text?: string
  ready_local?: string
  deadline_local?: string
  hazmat?: boolean
  pax_count?: number
  payload_kind?: 'cargo' | 'pax' | 'both'
  /** Soft-parsed client / company name from scratch notes */
  client_name?: string
  /** Call sounded ASAP / AOG */
  asap?: boolean
  notes?: string
  raw: string
}

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
  /** Client soft-pricing guidelines (Claude). */
  explainSoftPricing(briefingText: string): Promise<string>
}

/** Fill blank LLM fields from local scratch heuristics (IATA lanes, ASAP, client). */
export function mergeScratchExtract(
  primary: ExtractedRequest,
  fallback: ExtractedRequest,
): ExtractedRequest {
  const merged: ExtractedRequest = {
    raw: primary.raw || fallback.raw,
    origin_text: primary.origin_text?.trim() || fallback.origin_text,
    destination_text:
      primary.destination_text?.trim() || fallback.destination_text,
    pieces_text: primary.pieces_text?.trim() || fallback.pieces_text,
    client_name: primary.client_name?.trim() || fallback.client_name,
    ready_local: primary.ready_local?.trim() || fallback.ready_local,
    deadline_local: primary.deadline_local?.trim() || fallback.deadline_local,
    asap: primary.asap ?? fallback.asap,
    hazmat: primary.hazmat ?? fallback.hazmat,
    pax_count: primary.pax_count ?? fallback.pax_count,
    payload_kind: primary.payload_kind ?? fallback.payload_kind ?? 'cargo',
    notes:
      [fallback.notes, primary.notes].filter(Boolean).join('; ') || undefined,
  }
  return applyOperatorScratchDefaults(merged)
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
      }
    }
    const parsed = extractFromScratchNotes(rawText)
    return {
      ...parsed,
      payload_kind: parsed.payload_kind ?? 'cargo',
      hazmat: parsed.hazmat ?? /hazmat/i.test(rawText),
      notes: parsed.notes || 'mock extraction',
      raw: rawText,
    }
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

  async explainSoftPricing(briefingText: string): Promise<string> {
    const clipped = briefingText.trim().slice(0, 800)
    return clipped
      ? `Mock soft-pricing guidelines: ${clipped.slice(0, 280)}… This is not the actual price — estimate from fit and historical data; aircraft positions change.`
      : 'Mock soft-pricing guidelines: add cargo dims and a lane for a class-by-class estimate.'
  }
}

/** Real path → edge `llm-extract` (Claude when ANTHROPIC_API_KEY is set). */
export class ClaudeLlmAdapter implements LlmAdapter {
  async extractTripRequest(rawText: string): Promise<ExtractedRequest> {
    const heuristic = extractFromScratchNotes(rawText)
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(
        'LLM real mode needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY',
      )
    }
    try {
      const { data, error } = await supabase.functions.invoke('llm-extract', {
        body: { mode: 'extract_trip', text: rawText },
      })
      if (error) throw new Error(error.message || 'llm-extract failed')
      const body = data as ExtractedRequest & { error?: string }
      if (body?.error) throw new Error(body.error)
      // Edge prompt may omit client/asap or miss IATA dash lanes — fill gaps locally.
      return mergeScratchExtract({ ...body, raw: rawText }, heuristic)
    } catch (e) {
      console.warn('[llm] extract_trip failed — using scratch heuristics', e)
      return {
        ...heuristic,
        payload_kind: heuristic.payload_kind ?? 'cargo',
        notes: [heuristic.notes, 'llm_fallback'].filter(Boolean).join('; '),
        raw: rawText,
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

  async explainSoftPricing(briefingText: string): Promise<string> {
    if (!supabase || !isSupabaseConfigured) {
      return new MockLlmAdapter().explainSoftPricing(briefingText)
    }
    const { data, error } = await supabase.functions.invoke('llm-extract', {
      body: { mode: 'soft_pricing', text: briefingText },
    })
    if (error) throw new Error(error.message || 'llm-extract failed')
    const body = data as { text?: string; error?: string }
    if (body?.error) throw new Error(body.error)
    return body.text ?? ''
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
  return adapterMode('VITE_LLM_ADAPTER', 'real') === 'real'
}
