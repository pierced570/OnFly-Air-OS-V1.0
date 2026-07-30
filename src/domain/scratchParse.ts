/**
 * Heuristic extraction from call scratch notes → ExtractedRequest shape.
 * Used by MockLlmAdapter (and as fill-in for real LLM) so demos parse typed notes.
 *
 * Defaults: one-way, ASAP + today unless scheduled cues; techs → pax;
 * tools → standard tooling (12×12×12 @ 75 lb).
 */

import type { ExtractedRequest } from '@/adapters/llm'
import { lookupAirport } from '@/domain/airports'
import { parseDims } from '@/domain/dimsParser'
import {
  STANDARD_TOOLING,
  mentionsRoundTrip,
  mentionsScheduledTiming,
  mentionsTools,
} from '@/domain/standardTooling'

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
  'TOOL',
  'TOOLS',
  'THEN',
  'DROP',
  'OFF',
  'INTO',
  'THIS',
  'THAT',
  'HAVE',
  'WILL',
  'MUST',
  'NEXT',
  'ALSO',
  'JUST',
  'TWO',
  'FEW',
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
  /\b(?:ready|pickup|pick up|need(?:ed)?)\s*(?:at|by)?\s*(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i
const SKIDS =
  /(\d+\s*(?:skids?|crates?|pallets?|boxes?)[^.\n;]{0,80}(?:@\s*\d+\s*(?:ea|each)?)?)/i
/** Techs / engineers count as pax (not cargo). */
const TECHS =
  /(\d+)\s*(techs?|engineers?|mechanics?|technicians?)\b/i
const HAZMAT = /\b(hazmat|dangerous goods|dg\b)/i
const PAX = /(\d+)\s*(?:pax|passengers?)\b/i

function plausibleAirportToken(raw: string): boolean {
  const u = raw.trim().toUpperCase()
  if (!u || CODE_NOISE.has(u)) return false
  if (lookupAirport(u)) return true
  if (/^[KC][A-Z]{3}$/.test(u)) return true
  return false
}

function looksLikeLaneLine(line: string): boolean {
  if (CODE_LANE.test(line)) return true
  if (CITY_LANE.test(line)) return true
  return false
}

/**
 * Ordered airport stops from narrative call notes:
 * "Pickup … GSP / then … in CVG / then drop off in MHT"
 */
export function extractNarrativeStops(
  text: string,
  exclude: Set<string> = new Set(),
): string[] {
  const hits: Array<{ idx: number; code: string }> = []
  const cues: Array<{ re: RegExp; preferInAtTo: boolean }> = [
    // Pickup: take the first airport on the same line (avoid "in CVG" on next line).
    { re: /\b(?:pick\s*ups?|pickup)\b/gi, preferInAtTo: false },
    { re: /\bthen\b/gi, preferInAtTo: true },
    {
      re: /\b(?:drop\s*offs?|dropoffs?|deliver(?:y|ed|ies)?)\b/gi,
      preferInAtTo: true,
    },
  ]

  function lineSliceAfter(fromIdx: number): string {
    const lineEnd = text.indexOf('\n', fromIdx)
    const end = lineEnd === -1 ? text.length : lineEnd
    return text.slice(fromIdx, end)
  }

  function nextLineSlice(fromIdx: number): string {
    const lineEnd = text.indexOf('\n', fromIdx)
    if (lineEnd === -1) return ''
    const nextStart = lineEnd + 1
    const nextEnd = text.indexOf('\n', nextStart)
    return text.slice(nextStart, nextEnd === -1 ? text.length : nextEnd)
  }

  function firstAirportIn(
    slice: string,
    baseIdx: number,
    preferInAtTo: boolean,
  ): { idx: number; code: string } | null {
    if (preferInAtTo) {
      for (const im of slice.matchAll(
        /\b(?:in|at|to)\s+([A-Za-z]{3,4})\b/gi,
      )) {
        const code = im[1]!.toUpperCase()
        if (exclude.has(code) || !plausibleAirportToken(code)) continue
        return { idx: baseIdx + (im.index ?? 0), code }
      }
    }
    for (const tm of slice.matchAll(/\b([A-Za-z]{3,4})\b/g)) {
      const code = tm[1]!.toUpperCase()
      if (exclude.has(code) || !plausibleAirportToken(code)) continue
      return { idx: baseIdx + (tm.index ?? 0), code }
    }
    return null
  }

  for (const { re, preferInAtTo } of cues) {
    for (const m of text.matchAll(re)) {
      const start = (m.index ?? 0) + m[0].length
      const sameLine = lineSliceAfter(start)
      let found = firstAirportIn(sameLine, start, preferInAtTo)
      if (!found) {
        const next = nextLineSlice(start)
        const nextStart = text.indexOf('\n', start) + 1
        if (next && nextStart > 0) {
          found = firstAirportIn(next, nextStart, preferInAtTo)
        }
      }
      if (found) hits.push(found)
    }
  }

  hits.sort((a, b) => a.idx - b.idx)
  const out: string[] = []
  for (const h of hits) {
    if (!out.includes(h.code)) out.push(h.code)
  }
  return out
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
    const first = text.split(/\n/)[0]?.trim() ?? ''
    if (
      first &&
      first.length < 48 &&
      !looksLikeLaneLine(first) &&
      !/\d+\s*[x×]\s*\d+/i.test(first) &&
      !ASAP.test(first) &&
      !TECHS.test(first) &&
      !SKIDS.test(first)
    ) {
      client_name = first
      notes.push(`client(line1): ${client_name}`)
    }
  }

  const exclude = new Set<string>()
  if (client_name && /^[A-Za-z]{3,4}$/.test(client_name.trim())) {
    exclude.add(client_name.trim().toUpperCase())
  }

  let origin_text: string | undefined
  let destination_text: string | undefined
  let stop_texts: string[] | undefined

  const narrativeStops = extractNarrativeStops(text, exclude)
  const codeLane = text.match(CODE_LANE)
  const codeLaneOk =
    codeLane?.[1] &&
    codeLane[2] &&
    plausibleAirportToken(codeLane[1]) &&
    plausibleAirportToken(codeLane[2])

  if (narrativeStops.length >= 3) {
    stop_texts = narrativeStops
    origin_text = narrativeStops[0]
    destination_text = narrativeStops[narrativeStops.length - 1]
    notes.push(`stops: ${narrativeStops.join('→')}`)
  } else if (codeLaneOk) {
    origin_text = codeLane[1]!.toUpperCase()
    destination_text = codeLane[2]!.toUpperCase()
    stop_texts = [origin_text, destination_text]
    notes.push(`lane: ${origin_text}→${destination_text}`)
  } else if (narrativeStops.length >= 2) {
    stop_texts = narrativeStops
    origin_text = narrativeStops[0]
    destination_text = narrativeStops[narrativeStops.length - 1]
    notes.push(`stops: ${narrativeStops.join('→')}`)
  } else {
    const tokens = [...text.matchAll(/\b([A-Za-z]{3,4})\b/g)]
      .map((m) => m[1]!.toUpperCase())
      .filter((t) => !exclude.has(t) && plausibleAirportToken(t))
    // Deduplicate while preserving order
    const uniq: string[] = []
    for (const t of tokens) {
      if (!uniq.includes(t)) uniq.push(t)
    }
    if (uniq.length >= 2) {
      stop_texts = uniq
      origin_text = uniq[0]
      destination_text = uniq[uniq.length - 1]
      notes.push(
        uniq.length > 2
          ? `stops: ${uniq.join('→')}`
          : `codes: ${origin_text}→${destination_text}`,
      )
    } else {
      const city = text.match(CITY_LANE)
      if (city?.[1] && city[2]) {
        origin_text = city[1].trim()
        destination_text = city[2].trim()
        stop_texts = [origin_text, destination_text]
        notes.push(`city-lane: ${origin_text}→${destination_text}`)
      }
    }
  }

  let pieces_text: string | undefined
  let pax_count: number | undefined
  let payload_kind: ExtractedRequest['payload_kind'] = 'cargo'

  const tech = text.match(TECHS)
  if (tech?.[1]) {
    pax_count = Number(tech[1])
    payload_kind = 'pax'
    notes.push(`techs→pax: ${pax_count}`)
  }

  const paxMatch = text.match(PAX)
  if (paxMatch && pax_count == null) {
    pax_count = Number(paxMatch[1])
    payload_kind = 'pax'
    notes.push(`pax: ${pax_count}`)
  }

  // Tools → OnFly standard tooling (operator-facing name + fixed dims/weight).
  if (mentionsTools(text)) {
    pieces_text = `${STANDARD_TOOLING.label} ${STANDARD_TOOLING.dims_text}`
    payload_kind = pax_count ? 'both' : 'cargo'
    notes.push('tools→standard tooling 12x12x12 @ 75')
  }

  const skid = text.match(SKIDS)
  if (skid?.[1] && !mentionsTools(text)) {
    pieces_text = skid[1].trim()
    payload_kind = pax_count ? 'both' : 'cargo'
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
    const parsed = parseDims(
      pieces_text.replace(/^standard tooling\s+/i, ''),
    )
    if (!parsed.pieces.length && payload_kind === 'cargo') notes.push('dims weak')
  }

  const readyMatch = text.match(READY_TIME)
  const ready_local = readyMatch?.[1]?.trim()
  // Default ASAP unless notes clearly schedule a ready time / day.
  const asap =
    ASAP.test(text) || (!ready_local && !mentionsScheduledTiming(text))
  if (asap) notes.push('timing: ASAP (default)')
  else if (ready_local) notes.push(`ready: ${ready_local}`)
  else notes.push('timing: scheduled')

  if (!mentionsRoundTrip(text)) notes.push('one-way (default)')
  else notes.push('round-trip')

  return applyOperatorScratchDefaults({
    client_name,
    pieces_text,
    origin_text,
    destination_text,
    stop_texts,
    ready_local,
    asap,
    hazmat: HAZMAT.test(text),
    pax_count,
    payload_kind,
    notes: notes.join('; ') || 'scratch parse',
    raw: rawText,
  })
}

/**
 * Re-assert operator defaults after LLM merge (tools/techs/ASAP/one-way).
 * Safe to call twice — idempotent for these fields.
 */
export function applyOperatorScratchDefaults(
  ex: ExtractedRequest,
): ExtractedRequest {
  const text = (ex.raw ?? '').trim()
  if (!text) return ex

  let pieces_text = ex.pieces_text
  let pax_count = ex.pax_count
  let payload_kind = ex.payload_kind ?? 'cargo'
  const notes = [...(ex.notes ? [ex.notes] : [])]

  const tech = text.match(TECHS)
  if (tech?.[1]) {
    pax_count = Number(tech[1])
  } else if (pax_count == null) {
    const paxMatch = text.match(PAX)
    if (paxMatch?.[1]) pax_count = Number(paxMatch[1])
  }

  // LLM sometimes puts "2 Techs + Parts" in pieces — techs are pax, not cargo.
  if (
    pieces_text &&
    /\btechs?\b|\bengineers?\b|\bmechanics?\b|\btechnicians?\b/i.test(
      pieces_text,
    ) &&
    !/\d+\s*[x×]\s*\d+/i.test(pieces_text) &&
    !mentionsTools(pieces_text)
  ) {
    pieces_text = undefined
  }

  if (mentionsTools(text)) {
    pieces_text = `${STANDARD_TOOLING.label} ${STANDARD_TOOLING.dims_text}`
  }

  if (pax_count && pieces_text) payload_kind = 'both'
  else if (pax_count) payload_kind = 'pax'
  else if (pieces_text) payload_kind = 'cargo'

  const ready_local = ex.ready_local
  // Today + ASAP unless a ready clock / day is noted (or ASAP/AOG words).
  const asap =
    ASAP.test(text) ||
    (!ready_local?.trim() && !mentionsScheduledTiming(text))

  return {
    ...ex,
    pieces_text,
    pax_count,
    payload_kind,
    ready_local,
    asap,
    notes: notes.join('; ') || ex.notes,
  }
}
