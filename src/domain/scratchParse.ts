/**
 * Heuristic extraction from call scratch notes → ExtractedRequest shape.
 * Used by MockLlmAdapter (and as fill-in for real LLM) so demos parse typed notes.
 */

import type { ExtractedRequest } from '@/adapters/llm'
import { lookupAirport } from '@/domain/airports'
import { parseDims } from '@/domain/dimsParser'

/** Words that look like 3–4 letter codes but are not airports. */
const CODE_NOISE = new Set([
  'ASAP',
  'AOG',
  'HOT',
  'READY',
  'NEED',
  'NEEDED',
  'PICK',
  'FROM',
  'WITH',
  'PLUS',
  'AND',
  'THE',
  'FOR',
  'ONE',
  'WAY',
  'ROUND',
  'TRIP',
  'ONLY',
  'PART',
  'PARTS',
  'TECH',
  'TECHS',
  'PAX',
  'CREW',
  'SKID',
  'SKIDS',
  'CRATE',
  'BOX',
  'BOXES',
  'LB',
  'LBS',
  'ETA',
  'ETD',
  'UTC',
  'ZULU',
])

const CLIENT_LABEL =
  /(?:client|customer|acct|account|for)\s*[:\-]?\s*([A-Za-z0-9 &.'-]{2,60})/i
/** Lane separators dispatchers type: arrow, ASCII/Unicode dashes, slash. */
const CODE_LANE =
  /\b([A-Za-z]{3,4})\b\s*(?:→|->|—|–|−|-|\/)\s*\b([A-Za-z]{3,4})\b/
const CITY_LANE =
  /([A-Za-z][A-Za-z0-9 .,'/-]{1,40}?)\s*(?:→|->|\bto\b|\bTO\b)\s*([A-Za-z][A-Za-z0-9 .,'/-]{1,40})/
const ASAP = /\b(asap|aog|emergency|hot)\b/i
const READY_TIME =
  /\b(?:ready|pickup|pick up|need(?:ed)?)\s*(?:at|by)?\s*(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b/i
const SKIDS =
  /(\d+\s*(?:skids?|crates?|pallets?|boxes?)[^.\n;]{0,80}(?:@\s*\d+\s*(?:ea|each)?)?)/i
const TECHS_PARTS =
  /(\d+)\s*(techs?|engineers?|mechanics?|technicians?)(?:\s*\+\s*parts?)?/i
const HAZMAT = /\b(hazmat|dangerous goods|dg\b)/i
const PAX = /(\d+)\s*(?:pax|passengers?)\b/i

function plausibleAirportToken(raw: string): boolean {
  const u = raw.trim().toUpperCase()
  if (!u || CODE_NOISE.has(u)) return false
  if (lookupAirport(u)) return true
  // Unknown but ICAO-shaped (K/C + 3 letters)
  if (/^[KC][A-Z]{3}$/.test(u)) return true
  return false
}

function looksLikeLaneLine(line: string): boolean {
  if (CODE_LANE.test(line)) return true
  if (CITY_LANE.test(line)) return true
  return false
}

export function extractFromScratchNotes(rawText: string): ExtractedRequest {
  const text = rawText.trim()
  const notes: string[] = []
  if (!text) {
    return { raw: rawText, notes: 'empty scratch' }
  }

  let client_name: string | undefined
  const clientMatch = text.match(CLIENT_LABEL)
  if (clientMatch?.[1]) {
    client_name = clientMatch[1].trim()
    notes.push(`client: ${client_name}`)
  } else {
    // First line often "PSA" / "Acme MRO" before the route
    const first = text.split(/\n/)[0]?.trim() ?? ''
    if (
      first &&
      first.length < 48 &&
      !looksLikeLaneLine(first) &&
      !/\d+\s*[x×]\s*\d+/i.test(first) &&
      !ASAP.test(first) &&
      !TECHS_PARTS.test(first) &&
      !SKIDS.test(first)
    ) {
      client_name = first
      notes.push(`client(line1): ${client_name}`)
    }
  }

  let origin_text: string | undefined
  let destination_text: string | undefined

  const codeLane = text.match(CODE_LANE)
  if (
    codeLane?.[1] &&
    codeLane[2] &&
    plausibleAirportToken(codeLane[1]) &&
    plausibleAirportToken(codeLane[2])
  ) {
    origin_text = codeLane[1].toUpperCase()
    destination_text = codeLane[2].toUpperCase()
    notes.push(`lane: ${origin_text}→${destination_text}`)
  } else {
    // Scan known ICAO/IATA tokens in order (skip noise like ASAP)
    const tokens = [...text.matchAll(/\b([A-Za-z]{3,4})\b/g)]
      .map((m) => m[1]!.toUpperCase())
      .filter((t) => plausibleAirportToken(t))
    if (tokens.length >= 2) {
      origin_text = tokens[0]
      destination_text = tokens[1]
      notes.push(`codes: ${origin_text}→${destination_text}`)
    } else {
      const city = text.match(CITY_LANE)
      if (city?.[1] && city[2]) {
        origin_text = city[1].trim()
        destination_text = city[2].trim()
        notes.push(`city-lane: ${origin_text}→${destination_text}`)
      }
    }
  }

  let pieces_text: string | undefined
  let pax_count: number | undefined
  let payload_kind: ExtractedRequest['payload_kind'] = 'cargo'

  const tech = text.match(TECHS_PARTS)
  if (tech?.[1]) {
    pax_count = Number(tech[1])
    pieces_text = tech[0].trim()
    payload_kind = /\+?\s*parts?/i.test(tech[0]) ? 'both' : 'pax'
    notes.push(`mission: ${pieces_text}`)
  }

  const skid = text.match(SKIDS)
  if (skid?.[1]) {
    pieces_text = skid[1].trim()
    if (pax_count) payload_kind = 'both'
    else payload_kind = 'cargo'
  } else if (!pieces_text) {
    const dimOnly = text.match(
      /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?[^.\n]{0,40})/i,
    )
    if (dimOnly?.[1]) {
      pieces_text = `1 skid ${dimOnly[1].trim()}`
      payload_kind = pax_count ? 'both' : 'cargo'
    }
  }

  if (pieces_text && payload_kind !== 'pax') {
    const parsed = parseDims(pieces_text)
    if (!parsed.pieces.length && payload_kind === 'cargo') notes.push('dims weak')
  }

  const paxMatch = text.match(PAX)
  if (paxMatch && pax_count == null) {
    pax_count = Number(paxMatch[1])
    payload_kind = pieces_text && payload_kind === 'cargo' ? 'both' : 'pax'
  }

  const readyMatch = text.match(READY_TIME)
  const ready_local = readyMatch?.[1]?.trim()
  const asap = ASAP.test(text)
  if (asap) notes.push('timing: ASAP')
  else if (ready_local) notes.push(`ready: ${ready_local}`)

  return {
    client_name,
    pieces_text,
    origin_text,
    destination_text,
    ready_local,
    asap,
    hazmat: HAZMAT.test(text),
    pax_count,
    payload_kind,
    notes: notes.join('; ') || 'scratch parse',
    raw: rawText,
  }
}
