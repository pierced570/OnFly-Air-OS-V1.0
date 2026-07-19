/**
 * Weather adapter — live METAR/TAF via aviationweather.gov (edge proxy).
 * Flight categories: VFR green · MVFR blue · IFR red · LIFR purple.
 */

import { adapterMode } from '@/adapters/types'
import {
  categorizeTafPeriod,
  parseFlightCategory,
  parseVisSm,
  worstFlightCategory,
  type FlightCategory,
  type TafPeriodCat,
} from '@/domain/flightCategory'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type WxBrief = {
  icao: string
  summary: string
  metar: string | null
  taf: string | null
  /** Current observation flight category (METAR). */
  flightCat: FlightCategory | null
  /** TAF periods with derived categories. */
  tafPeriods: TafPeriodCat[]
  /** Worst category across TAF periods (planning chip). */
  tafWorstCat: FlightCategory | null
  notamStatus: 'unavailable' | 'stub' | 'ok'
  hardFlags: string[]
  fetchedAt: string
  source: 'mock' | 'aviationweather'
}

export interface WxAdapter {
  brief(icao: string): Promise<WxBrief>
}

type MetarRow = {
  rawOb?: string
  fltCat?: string
  wspeed?: number
  wspd?: number
  visib?: string | number
  cover?: string
  clouds?: Array<{ cover?: string; base?: number | null }>
  vertVis?: number | null
}

type TafRow = {
  rawTAF?: string
  fcsts?: Array<{
    timeFrom?: number
    timeTo?: number
    fcstChange?: string | null
    visib?: string | number | null
    vertVis?: number | null
    wxString?: string | null
    clouds?: Array<{ cover?: string; base?: number | null }>
  }>
}

export class MockWxAdapter implements WxAdapter {
  async brief(icao: string): Promise<WxBrief> {
    const code = icao.toUpperCase()
    return {
      icao: code,
      summary: `${code}: mock METAR — VFR, winds light. NOTAMs unavailable (apply for FAA API).`,
      metar: `${code} 011200Z 27008KT 10SM FEW040 18/08 A3012`,
      taf: `${code} 011200Z 0112/0212 27008KT P6SM FEW040`,
      flightCat: 'VFR',
      tafPeriods: [
        {
          label: 'BASE',
          timeFrom: new Date().toISOString(),
          timeTo: new Date(Date.now() + 6 * 3600_000).toISOString(),
          flightCat: 'VFR',
          visSm: 6,
          ceilingFt: null,
          wxString: null,
        },
      ],
      tafWorstCat: 'VFR',
      notamStatus: 'unavailable',
      hardFlags: [],
      fetchedAt: new Date().toISOString(),
      source: 'mock',
    }
  }
}

/**
 * Live METAR/TAF. Prefers Supabase edge `wx-brief` (CORS-safe);
 * falls back to direct aviationweather.gov fetch (works in Node/tests).
 */
export class AviationWeatherWxAdapter implements WxAdapter {
  async brief(icao: string): Promise<WxBrief> {
    const code = icao.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const fetchedAt = new Date().toISOString()
    const hardFlags: string[] = []

    let metarRow: MetarRow | null = null
    let tafRow: TafRow | null = null

    try {
      const viaEdge = await fetchViaEdge(code)
      if (viaEdge) {
        metarRow = viaEdge.metar
        tafRow = viaEdge.taf
      } else {
        const direct = await fetchDirect(code)
        metarRow = direct.metar
        tafRow = direct.taf
      }
    } catch (e) {
      console.warn('[wx] aviationweather fetch failed', e)
    }

    const metar = metarRow?.rawOb ?? null
    const taf = tafRow?.rawTAF ?? null

    const flightCat =
      parseFlightCategory(metarRow?.fltCat) ??
      (metarRow
        ? categorizeTafPeriod({
            timeFromSec: 0,
            timeToSec: 0,
            visib: metarRow.visib,
            vertVis: metarRow.vertVis,
            clouds: metarRow.clouds,
          }).flightCat
        : null)

    const tafPeriods = (tafRow?.fcsts ?? [])
      .filter((f) => f.timeFrom != null && f.timeTo != null)
      .map((f) =>
        categorizeTafPeriod({
          timeFromSec: f.timeFrom!,
          timeToSec: f.timeTo!,
          fcstChange: f.fcstChange,
          visib: f.visib,
          vertVis: f.vertVis,
          clouds: f.clouds,
          wxString: f.wxString,
        }),
      )

    const tafWorstCat = worstFlightCategory(tafPeriods.map((p) => p.flightCat))

    if (flightCat === 'LIFR' || flightCat === 'IFR') {
      hardFlags.push(`${code}: METAR ${flightCat}`)
    }
    if (tafWorstCat === 'LIFR' || tafWorstCat === 'IFR') {
      hardFlags.push(`${code}: TAF includes ${tafWorstCat}`)
    }

    const wind = metarRow?.wspd ?? metarRow?.wspeed
    if (typeof wind === 'number' && wind >= 25) {
      hardFlags.push(`${code}: winds ${wind} kt`)
    }
    if (taf && /\b(FZRA|TS|SN)\b/.test(taf)) {
      hardFlags.push(`${code}: TAF mentions significant weather`)
    }

    const vis = parseVisSm(metarRow?.visib)
    const catBit = flightCat ? `${flightCat}` : 'cat?'
    const parts = [
      metar
        ? `METAR ${catBit}${vis != null ? ` ${vis}SM` : ''} · ${metar}`
        : `${code}: METAR unavailable`,
      taf
        ? `TAF${tafWorstCat ? ` (${tafWorstCat} worst)` : ''} ${taf.slice(0, 140)}${
            taf.length > 140 ? '…' : ''
          }`
        : null,
      'NOTAMs unavailable (FAA API approval pending).',
    ].filter(Boolean)

    return {
      icao: code,
      summary: parts.join(' · '),
      metar,
      taf,
      flightCat,
      tafPeriods,
      tafWorstCat,
      notamStatus: 'unavailable',
      hardFlags,
      fetchedAt,
      source: 'aviationweather',
    }
  }
}

async function fetchViaEdge(
  code: string,
): Promise<{ metar: MetarRow | null; taf: TafRow | null } | null> {
  if (!supabase || !isSupabaseConfigured) return null
  const { data, error } = await supabase.functions.invoke('wx-brief', {
    body: { icao: code },
  })
  if (error) {
    console.warn('[wx] edge wx-brief failed', error.message)
    return null
  }
  const body = data as {
    metar?: MetarRow | null
    taf?: TafRow | null
    error?: string
  } | null
  if (body?.error) {
    console.warn('[wx] edge', body.error)
    return null
  }
  return {
    metar: body?.metar ?? null,
    taf: body?.taf ?? null,
  }
}

async function fetchDirect(
  code: string,
): Promise<{ metar: MetarRow | null; taf: TafRow | null }> {
  const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(code)}&format=json`
  const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(code)}&format=json`
  const [mRes, tRes] = await Promise.all([fetch(metarUrl), fetch(tafUrl)])
  let metar: MetarRow | null = null
  let taf: TafRow | null = null
  if (mRes.ok) {
    const rows = (await mRes.json()) as MetarRow[]
    metar = rows[0] ?? null
  }
  if (tRes.ok) {
    const rows = (await tRes.json()) as TafRow[]
    taf = rows[0] ?? null
  }
  return { metar, taf }
}

export function createWxAdapter(): WxAdapter {
  // Default to real when unset — keyless public API (via edge in browser).
  const mode = adapterMode('VITE_WX_ADAPTER', 'real')
  return mode === 'real' ? new AviationWeatherWxAdapter() : new MockWxAdapter()
}
