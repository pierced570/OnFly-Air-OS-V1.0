import { adapterMode } from '@/adapters/types'

export type WxBrief = {
  icao: string
  summary: string
  metar: string | null
  taf: string | null
  notamStatus: 'unavailable' | 'stub' | 'ok'
  hardFlags: string[]
  fetchedAt: string
  source: 'mock' | 'aviationweather'
}

export interface WxAdapter {
  brief(icao: string): Promise<WxBrief>
}

export class MockWxAdapter implements WxAdapter {
  async brief(icao: string): Promise<WxBrief> {
    const code = icao.toUpperCase()
    return {
      icao: code,
      summary: `${code}: mock METAR — VFR, winds light. NOTAMs unavailable (apply for FAA API).`,
      metar: `${code} 011200Z 27008KT 10SM FEW040 18/08 A3012`,
      taf: null,
      notamStatus: 'unavailable',
      hardFlags: [],
      fetchedAt: new Date().toISOString(),
      source: 'mock',
    }
  }
}

/**
 * Live METAR/TAF from aviationweather.gov (no API key).
 * NOTAMs remain stub until FAA API approval.
 */
export class AviationWeatherWxAdapter implements WxAdapter {
  async brief(icao: string): Promise<WxBrief> {
    const code = icao.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const fetchedAt = new Date().toISOString()
    const hardFlags: string[] = []
    let metar: string | null = null
    let taf: string | null = null

    try {
      const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(code)}&format=json`
      const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(code)}&format=json`
      const [mRes, tRes] = await Promise.all([
        fetch(metarUrl),
        fetch(tafUrl),
      ])
      if (mRes.ok) {
        const rows = (await mRes.json()) as Array<{
          rawOb?: string
          fltCat?: string
          wspeed?: number
          visib?: string | number
        }>
        const row = rows[0]
        if (row?.rawOb) metar = row.rawOb
        if (row?.fltCat === 'LIFR' || row?.fltCat === 'IFR') {
          hardFlags.push(`${code}: flight category ${row.fltCat}`)
        }
        if (typeof row?.wspeed === 'number' && row.wspeed >= 25) {
          hardFlags.push(`${code}: winds ${row.wspeed} kt`)
        }
      }
      if (tRes.ok) {
        const rows = (await tRes.json()) as Array<{ rawTAF?: string }>
        if (rows[0]?.rawTAF) taf = rows[0].rawTAF
        if (taf && /\b(FG|FZRA|TS|SN)\b/.test(taf)) {
          hardFlags.push(`${code}: TAF mentions significant weather`)
        }
      }
    } catch (e) {
      console.warn('[wx] aviationweather fetch failed', e)
    }

    const parts = [
      metar ? `METAR ${metar}` : `${code}: METAR unavailable`,
      taf ? `TAF ${taf.slice(0, 160)}${taf.length > 160 ? '…' : ''}` : null,
      'NOTAMs unavailable (FAA API approval pending).',
    ].filter(Boolean)

    return {
      icao: code,
      summary: parts.join(' · '),
      metar,
      taf,
      notamStatus: 'unavailable',
      hardFlags,
      fetchedAt,
      source: 'aviationweather',
    }
  }
}

export function createWxAdapter(): WxAdapter {
  // Default to real when unset — keyless public API.
  const mode = adapterMode('VITE_WX_ADAPTER', 'real')
  return mode === 'real' ? new AviationWeatherWxAdapter() : new MockWxAdapter()
}
