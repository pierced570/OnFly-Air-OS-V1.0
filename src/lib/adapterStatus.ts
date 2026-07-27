/**
 * Which external doors are live vs still waiting on vendor wiring.
 */

import { isLiveEmailConfigured, isRealEmailEnabled } from '@/adapters/email'
import { isRealLlmEnabled } from '@/adapters/llm'
import { isRealMapsEnabled } from '@/adapters/maps'
import { isRealAdsbEnabled } from '@/adapters/adsb'
import { isRealQbEnabled } from '@/adapters/accounting'
import { adapterMode } from '@/adapters/types'
import { isSupabaseConfigured } from '@/lib/supabase'

export type AdapterDoorStatus = {
  id: string
  label: string
  state: 'live' | 'mock' | 'blocked'
  detail: string
}

export function listAdapterDoorStatus(): AdapterDoorStatus[] {
  const mapbox = Boolean(
    (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim(),
  )
  const wx = adapterMode('VITE_WX_ADAPTER', 'real') === 'real'

  return [
    {
      id: 'supabase',
      label: 'Supabase',
      state: isSupabaseConfigured ? 'live' : 'blocked',
      detail: isSupabaseConfigured
        ? 'URL + anon key'
        : 'Set VITE_SUPABASE_URL / ANON_KEY',
    },
    {
      id: 'email',
      label: 'Email (Resend)',
      state: isLiveEmailConfigured()
        ? 'live'
        : isRealEmailEnabled()
          ? 'blocked'
          : 'mock',
      detail: isLiveEmailConfigured()
        ? 'send-email edge'
        : 'Needs Supabase + RESEND_API_KEY secret',
    },
    {
      id: 'maps',
      label: 'Maps (Mapbox)',
      state: isRealMapsEnabled() && mapbox ? 'live' : mapbox ? 'mock' : 'blocked',
      detail:
        isRealMapsEnabled() && mapbox
          ? 'Directions live'
          : 'VITE_MAPBOX_TOKEN + VITE_MAPS_ADAPTER=real',
    },
    {
      id: 'llm',
      label: 'LLM (Claude)',
      state:
        isRealLlmEnabled() && isSupabaseConfigured
          ? 'live'
          : isRealLlmEnabled()
            ? 'blocked'
            : 'mock',
      detail:
        isRealLlmEnabled() && isSupabaseConfigured
          ? 'llm-extract · D085 + intake'
          : 'ANTHROPIC_API_KEY on edge + VITE_LLM_ADAPTER=real',
    },
    {
      id: 'wx',
      label: 'WX METAR/TAF',
      state: wx ? 'live' : 'mock',
      detail: wx
        ? 'aviationweather.gov · VFR/MVFR/IFR/LIFR'
        : 'VITE_WX_ADAPTER=real',
    },
    {
      id: 'adsb',
      label: 'ADS-B (FlightAware)',
      state: isRealAdsbEnabled() && isSupabaseConfigured ? 'live' : 'blocked',
      detail: isRealAdsbEnabled() && isSupabaseConfigured
        ? 'Seed + alert watchlist via AeroAPI · FLIGHTAWARE_AEROAPI_KEY on edge'
        : 'Set FLIGHTAWARE_AEROAPI_KEY + VITE_ADSB_ADAPTER=real; seed from Radar',
    },
    {
      id: 'comms',
      label: 'SMS (RingCentral)',
      state: 'blocked',
      detail: 'Need RC JWT + SMS from-numbers',
    },
    {
      id: 'qb',
      label: 'QuickBooks',
      state: isRealQbEnabled() && isSupabaseConfigured
        ? 'live'
        : isRealQbEnabled()
          ? 'blocked'
          : 'mock',
      detail:
        isRealQbEnabled() && isSupabaseConfigured
          ? 'quickbooks-api · OAuth + branded Resend PDF'
          : 'Set VITE_QB_ADAPTER=real + QB_CLIENT_ID/SECRET on edge',
    },
    {
      id: 'notam',
      label: 'NOTAMs',
      state: 'blocked',
      detail: 'FAA NOTAM API enrollment pending',
    },
  ]
}
