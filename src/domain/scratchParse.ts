/**
 * Heuristic extraction from call scratch notes → ExtractedRequest shape.
 * Used by MockLlmAdapter so demos parse real typed notes (approve, don't auto-enter).
 */

import type { ExtractedRequest } from '@/adapters/llm'
import { parseDims } from '@/domain/dimsParser'

const ICAO = /\b([Kk][A-Z]{3}|[A-Z]{4})\b/g
const ARROW =
  /([A-Za-z][A-Za-z0-9 .,'/-]{1,40}?)\s*(?:→|->|to|TO)\s*([A-Za-z][A-Za-z0-9 .,'/-]{1,40})/
const CLIENT =
  /(?:client|customer|acct|account|for)\s*[:\-]?\s*([A-Za-z0-9 &.'-]{2,60})/i
const ASAP = /\b(asap|aog|emergency|hot)\b/i
const READY_TIME =
  /\b(?:ready|pickup|pick up|need(?:ed)?)\s*(?:at|by)?\s*(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b/i
const SKIDS =
  /(\d+\s*(?:skids?|crates?|pallets?|boxes?)[^.\n;]{0,80}(?:@\s*\d+\s*(?:ea|each)?)?)/i
const HAZMAT = /\b(hazmat|dangerous goods|dg\b)/i
const PAX = /(\d+)\s*(?:pax|passengers?)\b/i

export function extractFromScratchNotes(rawText: string): ExtractedRequest {
  const text = rawText.trim()
  const notes: string[] = []
  if (!text) {
    return { raw: rawText, notes: 'empty scratch' }
  }

  let client_name: string | undefined
  const clientMatch = text.match(CLIENT)
  if (clientMatch?.[1]) {
    client_name = clientMatch[1].trim()
    notes.push(`client: ${client_name}`)
  } else {
    // First line often "Acme MRO" before route
    const first = text.split(/\n/)[0]?.trim()
    if (first && first.length < 48 && !ARROW.test(first) && !/\d+\s*x\s*\d+/i.test(first)) {
      client_name = first
      notes.push(`client(line1): ${client_name}`)
    }
  }

  let origin_text: string | undefined
  let destination_text: string | undefined
  const codes = [...text.matchAll(ICAO)].map((m) => m[1]!.toUpperCase())
  if (codes.length >= 2) {
    origin_text = codes[0]
    destination_text = codes[1]
  } else {
    const arrow = text.match(ARROW)
    if (arrow) {
      origin_text = arrow[1]!.trim()
      destination_text = arrow[2]!.trim()
    }
  }

  let pieces_text: string | undefined
  const skid = text.match(SKIDS)
  if (skid?.[1]) {
    pieces_text = skid[1].trim()
  } else {
    const dimOnly = text.match(
      /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?[^.\n]{0,40})/i,
    )
    if (dimOnly?.[1]) pieces_text = `1 skid ${dimOnly[1].trim()}`
  }
  if (pieces_text) {
    const parsed = parseDims(pieces_text)
    if (!parsed.pieces.length) notes.push('dims weak')
  }

  const ready_local = READY_TIME.test(text)
    ? undefined // leave for UI; mark ASAP below
    : undefined
  const asap = ASAP.test(text)
  if (asap) notes.push('timing: ASAP')

  const paxMatch = text.match(PAX)
  const pax_count = paxMatch ? Number(paxMatch[1]) : undefined
  const payload_kind: ExtractedRequest['payload_kind'] = pax_count
    ? pieces_text
      ? 'both'
      : 'pax'
    : 'cargo'

  return {
    client_name,
    pieces_text,
    origin_text,
    destination_text,
    ready_local: ready_local,
    asap,
    hazmat: HAZMAT.test(text),
    pax_count,
    payload_kind,
    notes: notes.join('; ') || 'scratch parse',
    raw: rawText,
  }
}
