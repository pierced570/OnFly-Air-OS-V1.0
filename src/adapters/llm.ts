/**
 * LLM adapter — mock canned extract or Claude via edge `llm-extract`.
 * ANTHROPIC_API_KEY lives in Supabase secrets only (never VITE_*).
 */

import { adapterMode } from '@/adapters/types'
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
  notes?: string
  raw: string
}

export interface LlmAdapter {
  extractTripRequest(rawText: string): Promise<ExtractedRequest>
  /** Plain-English NOTAM / briefing helper */
  plainEnglish(text: string, context?: string): Promise<string>
}

export class MockLlmAdapter implements LlmAdapter {
  async extractTripRequest(rawText: string): Promise<ExtractedRequest> {
    const fromTo =
      rawText.match(
        /\bfrom\s+([^.\n]+?)\s+to\s+([^.\n]+?)(?:\s+ready|\s*$|[.])/i,
      ) ??
      rawText.match(/\b([A-Z]{3,4})\s*(?:→|->|to)\s*([A-Z]{3,4})\b/i)
    const origin_text = fromTo?.[1]?.trim() || 'Akron, OH'
    const destination_text = fromTo?.[2]?.trim() || 'Chicago, IL'
    const pieces =
      rawText.match(
        /(\d+\s*(?:skids?|crates?|pieces?)[^.\n]{0,40})/i,
      )?.[1] ?? '3 skids 48x40x60 @ 800ea'
    return {
      pieces_text: pieces.trim(),
      origin_text,
      destination_text,
      ready_local: '2026-07-15T09:00',
      payload_kind: 'cargo',
      hazmat: /hazmat/i.test(rawText),
      notes: 'mock extraction',
      raw: rawText,
    }
  }

  async plainEnglish(text: string, _context?: string): Promise<string> {
    const clipped = text.trim().slice(0, 280)
    return clipped
      ? `Mock plain English: ${clipped}`
      : 'Mock plain English: (empty)'
  }
}

/** Real path → edge `llm-extract` (Claude when ANTHROPIC_API_KEY is set). */
export class ClaudeLlmAdapter implements LlmAdapter {
  async extractTripRequest(rawText: string): Promise<ExtractedRequest> {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(
        'LLM real mode needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY',
      )
    }
    const { data, error } = await supabase.functions.invoke('llm-extract', {
      body: { mode: 'extract_trip', text: rawText },
    })
    if (error) throw new Error(error.message || 'llm-extract failed')
    const body = data as ExtractedRequest & { error?: string }
    if (body?.error) throw new Error(body.error)
    return { ...body, raw: rawText }
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
}

/** @deprecated alias — real LLM is Claude via llm-extract */
export const OpenAiLlmAdapter = ClaudeLlmAdapter

export function createLlmAdapter(): LlmAdapter {
  const mode = adapterMode('VITE_LLM_ADAPTER', 'mock')
  if (mode === 'real') return new ClaudeLlmAdapter()
  return new MockLlmAdapter()
}

export function isRealLlmEnabled(): boolean {
  return adapterMode('VITE_LLM_ADAPTER', 'mock') === 'real'
}
