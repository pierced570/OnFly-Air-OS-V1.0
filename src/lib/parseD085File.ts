/**
 * Read a D085 upload and extract aircraft rows (Claude when live, else heuristics).
 * Always returns rows for human verify — never auto-commits fleet.
 */

import { createLlmAdapter, isRealLlmEnabled } from '@/adapters/llm'
import {
  extractTailsFromText,
  fixtureD085Rows,
  normalizeD085Rows,
  type D085AircraftRow,
} from '@/domain/d085Parse'
import { loadNetwork } from '@/lib/networkData'

export type D085ParseResult = {
  rows: D085AircraftRow[]
  source: 'llm' | 'heuristic' | 'fixture'
  note?: string
}

/** Pull printable text from PDF bytes (best-effort; no full OCR). */
export function extractPrintableText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  let run = ''
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!
    if (c >= 32 && c < 127) {
      run += String.fromCharCode(c)
    } else if (run.length >= 4) {
      out += `${run}\n`
      run = ''
    } else {
      run = ''
    }
  }
  if (run.length >= 4) out += run
  return out
}

export async function readFileForD085(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.csv')) {
    return file.text()
  }
  const buf = await file.arrayBuffer()
  const printable = extractPrintableText(buf)
  // Prefer UTF-8 decode when mostly text
  if (printable.length < 80) {
    try {
      return new TextDecoder('utf-8').decode(buf)
    } catch {
      return printable
    }
  }
  return printable
}

export async function parseD085File(file: File): Promise<D085ParseResult> {
  const text = (await readFileForD085(file)).trim()
  const net = await loadNetwork()
  const knownTypes = new Set(
    (net.type_specs ?? [])
      .map((s) => String((s as { type_name?: string }).type_name ?? '').trim())
      .filter(Boolean),
  )
  // Also seed common names from fleet
  for (const a of net.aircraft) {
    if (a.type_name) knownTypes.add(a.type_name)
  }

  if (text.length < 20 && !/\bN[0-9]/i.test(text)) {
    return {
      rows: fixtureD085Rows(),
      source: 'fixture',
      note: 'Little extractable text (scanned PDF?) — showing review fixtures. Paste a text D085 or verify tails manually.',
    }
  }

  if (isRealLlmEnabled()) {
    try {
      const llm = createLlmAdapter()
      const extracted = await llm.extractD085(
        `File: ${file.name}\n\n${text.slice(0, 20000)}`,
      )
      const rows = normalizeD085Rows(extracted, knownTypes)
      if (rows.length) {
        return { rows, source: 'llm' }
      }
    } catch (e) {
      console.warn('[d085] LLM extract failed', e)
    }
  }

  // Heuristic: tails from text + unknown types for review
  const tails = extractTailsFromText(text)
  if (tails.length) {
    return {
      rows: normalizeD085Rows(
        tails.map((tail) => ({ tail, type_name: 'Unknown' })),
        knownTypes,
      ),
      source: 'heuristic',
      note: 'Heuristic N-number scan — confirm types before saving.',
    }
  }

  return {
    rows: fixtureD085Rows(),
    source: 'fixture',
    note: 'No tails found — fixture rows for UI review only.',
  }
}
