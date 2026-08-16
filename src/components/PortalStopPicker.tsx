/**
 * Pickup / drop-off picker — hangar · field FBO · TBD.
 * Used on Quick Dispatch (dark) and desk portal edit (cream via className).
 */

import { useMemo, useSyncExternalStore } from 'react'
import type { PortalStopKind, PortalStopLocation } from '@/domain/portalStopLocation'
import {
  emptyPortalStop,
  fboStop,
  hangarStop,
  tbdStop,
} from '@/domain/portalStopLocation'
import { listFbos, subscribeFbos, type FboRow } from '@/lib/fboStore'

function formatFboAddress(fbo: FboRow): string {
  const line1 = fbo.street.trim()
  const cityBits = [fbo.city, fbo.state].filter(Boolean).join(', ')
  const line2 = [cityBits, fbo.zip].filter(Boolean).join(' ').trim()
  if (line1 && line2) return `${line1}, ${line2}`
  return line1 || line2 || ''
}

type Props = {
  label: string
  icao: string
  value: PortalStopLocation
  onChange: (next: PortalStopLocation) => void
  /** Dark dispatch UI vs cream portal desk edit. */
  tone?: 'dark' | 'cream'
}

export function PortalStopPicker({
  label,
  icao,
  value,
  onChange,
  tone = 'dark',
}: Props) {
  const fbos = useSyncExternalStore(subscribeFbos, listFbos, listFbos)
  const fieldFbos = useMemo(() => {
    const code = icao.trim().toUpperCase()
    if (!code) return []
    return fbos.filter((f) => f.airport_icao.toUpperCase() === code)
  }, [fbos, icao])

  const dark = tone === 'dark'
  const input = dark
    ? 'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
    : 'mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold'
  const labelCls = dark
    ? 'block text-xs font-medium uppercase tracking-wider text-muted'
    : 'block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted'
  const chip = (on: boolean) =>
    [
      'rounded-md px-2.5 py-1.5 text-xs font-medium',
      on
        ? dark
          ? 'bg-gold text-ink'
          : 'bg-gold text-ink'
        : dark
          ? 'bg-surface-2 text-muted hover:text-cream'
          : 'bg-[#F7F2E3] text-muted hover:text-ink',
    ].join(' ')

  function setKind(kind: PortalStopKind) {
    const code = icao.trim().toUpperCase() || value.icao
    if (kind === 'tbd') {
      onChange(tbdStop(code))
      return
    }
    if (kind === 'hangar') {
      onChange(
        hangarStop({
          icao: code,
          name: value.kind === 'hangar' ? value.name : 'Client hangar',
          address: value.kind === 'hangar' ? value.address : null,
        }),
      )
      return
    }
    if (kind === 'fbo') {
      const first = fieldFbos[0]
      if (first) {
        onChange(
          fboStop({
            icao: code || first.airport_icao,
            fbo_id: first.id,
            name: first.name,
            address: formatFboAddress(first) || null,
          }),
        )
      } else {
        onChange({
          kind: 'fbo',
          name: null,
          address: null,
          fbo_id: null,
          icao: code,
        })
      }
      return
    }
    onChange({
      ...emptyPortalStop(code),
      kind: 'custom',
      name: value.name,
      address: value.address,
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={labelCls}>
          {label}
          {icao ? (
            <span className="ml-1 font-mono normal-case tracking-normal text-gold">
              {icao}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={chip(value.kind === 'hangar')}
          onClick={() => setKind('hangar')}
        >
          Client hangar
        </button>
        <button
          type="button"
          className={chip(value.kind === 'fbo')}
          onClick={() => setKind('fbo')}
        >
          Field FBO
        </button>
        <button
          type="button"
          className={chip(value.kind === 'tbd')}
          onClick={() => setKind('tbd')}
        >
          TBD
        </button>
      </div>

      {value.kind === 'tbd' && (
        <p className={dark ? 'text-[11px] text-muted' : 'text-[11px] text-muted'}>
          Left blank on the tracking portal until desk fills it in.
        </p>
      )}

      {value.kind === 'fbo' && (
        <label className={labelCls}>
          FBO at {icao || 'airport'}
          <select
            className={input}
            value={value.fbo_id ?? ''}
            onChange={(e) => {
              const id = e.target.value
              const hit = fieldFbos.find((f) => f.id === id)
              if (!hit) {
                onChange({ ...value, fbo_id: null, name: null, address: null })
                return
              }
              onChange(
                fboStop({
                  icao: hit.airport_icao,
                  fbo_id: hit.id,
                  name: hit.name,
                  address: formatFboAddress(hit) || null,
                }),
              )
            }}
          >
            <option value="">Select FBO…</option>
            {fieldFbos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.is_24hr ? ' · 24/7' : ''}
              </option>
            ))}
          </select>
          {!fieldFbos.length && (
            <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-muted">
              No FBOs on file for this ICAO — add under Network → FBOs, or use
              hangar / TBD.
            </span>
          )}
        </label>
      )}

      {(value.kind === 'hangar' ||
        value.kind === 'custom' ||
        (value.kind === 'fbo' && value.fbo_id)) && (
        <>
          <label className={labelCls}>
            Name
            <input
              className={input}
              value={value.name ?? ''}
              onChange={(e) =>
                onChange({ ...value, name: e.target.value || null })
              }
              placeholder={
                value.kind === 'hangar' ? 'Client hangar' : 'Location name'
              }
            />
          </label>
          <label className={labelCls}>
            Address
            <textarea
              className={`${input} min-h-[64px]`}
              value={value.address ?? ''}
              onChange={(e) =>
                onChange({ ...value, address: e.target.value || null })
              }
              placeholder="Street, city, state…"
            />
          </label>
        </>
      )}
    </div>
  )
}
