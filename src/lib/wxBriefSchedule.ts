/**
 * Schedule T-3h / T-1h WX briefs from departure estimate.
 */

import { canPersist, db, safeQuery } from '@/lib/db/client'
import { getTrip } from '@/lib/tripStore'
import { raiseException } from '@/lib/exceptionStore'

function airLegDepartIso(tripId: string): string | null {
  const t = getTrip(tripId)
  if (!t) return null
  const air =
    t.legs.find((l) => l.type === 'air_leg' && l.est_start) ??
    t.legs.find((l) => l.est_start)
  return air?.est_start ?? null
}

function icaoForTrip(tripId: string): string | null {
  const t = getTrip(tripId)
  if (!t) return null
  const air = t.legs.find((l) => l.type === 'air_leg')
  return air?.origin || t.lane.split('→')[0]?.trim() || null
}

/** Enqueue T-3h and T-1h briefs when a trip is booked / QD'd. */
export async function scheduleWxBriefsForTrip(tripId: string): Promise<number> {
  const depart = airLegDepartIso(tripId)
  if (!depart) return 0
  const departMs = Date.parse(depart)
  if (!Number.isFinite(departMs)) return 0
  const icao = icaoForTrip(tripId)
  const rows = [
    {
      trip_id: tripId,
      kind: 't3h' as const,
      fire_at: new Date(departMs - 3 * 3600_000).toISOString(),
      icao,
      status: 'scheduled',
    },
    {
      trip_id: tripId,
      kind: 't1h' as const,
      fire_at: new Date(departMs - 1 * 3600_000).toISOString(),
      icao,
      status: 'scheduled',
    },
  ]

  if (!canPersist()) {
    // Session-only: raise soft reminders via exception if already due
    const now = Date.now()
    for (const r of rows) {
      if (Date.parse(r.fire_at) <= now) {
        const trip = getTrip(tripId)
        raiseException({
          trip_id: tripId,
          trip_ref: trip?.ref ?? null,
          title: `WX ${r.kind.toUpperCase()} due`,
          detail: `Brief ${r.icao ?? 'origin'} before departure`,
          severity: 'attn',
          href: `/trips/${tripId}`,
        })
      }
    }
    return rows.length
  }

  await safeQuery('wx_brief_schedule.upsert', () =>
    db().from('wx_brief_schedule').upsert(rows, {
      onConflict: 'trip_id,kind',
    }),
  )
  return rows.length
}

/** Client-side tick: fire due WX schedule rows → exceptions + trip_events. */
export async function tickWxBriefs(now = new Date()): Promise<number> {
  if (!canPersist()) return 0
  const nowIso = now.toISOString()
  const due = await safeQuery<Record<string, unknown>[]>('wx_brief_schedule.due', () =>
    db()
      .from('wx_brief_schedule')
      .select('*')
      .eq('status', 'scheduled')
      .lte('fire_at', nowIso)
      .limit(20),
  )
  if (!Array.isArray(due) || !due.length) {
    // Still run SQL helper if available
    await safeQuery('fire_due_wx_briefs', () => db().rpc('fire_due_wx_briefs'))
    return 0
  }

  let n = 0
  for (const r of due) {
    const tripId = String(r.trip_id)
    const trip = getTrip(tripId)
    const kind = String(r.kind)
    const icao = r.icao ? String(r.icao) : null

    // Live brief when possible
    let summary = `WX ${kind} window — check METAR/TAF`
    let hard: string[] = []
    try {
      if (icao && icao.length >= 3) {
        const { createWxAdapter } = await import('@/adapters/wx')
        const wx = createWxAdapter()
        const brief = await wx.brief(icao.toUpperCase())
        if (brief) {
          summary = `${brief.icao} ${brief.flightCat ?? ''} · ${brief.metar?.slice(0, 120) ?? 'no METAR'}`
          if (brief.flightCat === 'LIFR' || brief.flightCat === 'IFR') {
            hard.push(`${brief.icao} ${brief.flightCat}`)
          }
          for (const f of brief.hardFlags ?? []) hard.push(f)
        }
      }
    } catch {
      /* keep default summary */
    }

    await safeQuery('wx_brief_schedule.fire', () =>
      db()
        .from('wx_brief_schedule')
        .update({
          status: 'fired',
          fired_at: nowIso,
          summary,
          hard_flags: hard,
        })
        .eq('id', String(r.id)),
    )

    if (trip) {
      const { mutateTrip } = await import('@/lib/tripStore')
      mutateTrip(tripId, (t) => {
        t.events.push({
          at: nowIso,
          actor: 'system',
          kind: 'wx_brief',
          payload: { kind, icao, summary, hard_flags: hard },
        })
      })
    }

    if (hard.length) {
      raiseException({
        trip_id: tripId,
        trip_ref: trip?.ref ?? null,
        title: `Hard WX ${kind.toUpperCase()}`,
        detail: hard.join(' · '),
        severity: 'late',
        href: `/trips/${tripId}`,
      })
    } else {
      raiseException({
        trip_id: tripId,
        trip_ref: trip?.ref ?? null,
        title: `WX ${kind.toUpperCase()} brief`,
        detail: summary,
        severity: 'attn',
        href: `/trips/${tripId}`,
      })
    }
    n++
  }
  return n
}
