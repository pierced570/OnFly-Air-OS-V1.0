/**
 * Minute cron: fire due T-minus checkpoints → needs_info_tasks + SMS queue.
 *
 * Schedule in Dashboard → Edge Functions → Schedules:
 * every minute → checkpoint-tick
 *
 * Deploy: supabase functions deploy checkpoint-tick
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !service) {
    return json({ error: 'Supabase env missing' }, 500)
  }

  const sb = createClient(url, service)
  const now = new Date().toISOString()

  const { data: due, error } = await sb
    .from('checkpoints')
    .select('*')
    .eq('status', 'scheduled')
    .lte('fire_at', now)
    .limit(50)

  if (error) {
    console.error('[checkpoint-tick]', error)
    return json({ error: error.message }, 500)
  }

  let fired = 0
  for (const cp of due ?? []) {
    const { data: trip } = await sb
      .from('trips')
      .select('id,ref,state')
      .eq('id', cp.trip_id)
      .maybeSingle()

    if (
      !trip ||
      ['delivered', 'closed', 'cancelled', 'invoiced', 'lost'].includes(
        String(trip.state),
      )
    ) {
      await sb
        .from('checkpoints')
        .update({ status: 'cancelled' })
        .eq('id', cp.id)
      continue
    }

    const title = cp.title || `${cp.kind} check-in`
    const detail = cp.detail || `Due checkpoint for T-${trip.ref}`

    const { data: task } = await sb
      .from('needs_info_tasks')
      .insert({
        entity: 'trip',
        entity_id: trip.id,
        field: `checkpoint:${cp.kind}`,
        note: `${title} — ${detail}`,
      })
      .select('id')
      .maybeSingle()

    const { data: shift } = await sb
      .from('shifts')
      .select('phone')
      .eq('active', true)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (shift?.phone) {
      await sb.from('comms_messages').insert({
        channel: 'sms',
        direction: 'out',
        to_ref: shift.phone,
        body: `OnFly check-in: T-${trip.ref} · ${title}`,
        trip_id: trip.id,
        delivery_status: 'queued',
      })
    }

    await sb
      .from('checkpoints')
      .update({
        status: 'fired',
        fired_at: now,
        exception_id: task?.id ?? null,
      })
      .eq('id', cp.id)

    await sb.from('trip_events').insert({
      trip_id: trip.id,
      actor: 'system',
      kind: 'checkpoint_fired',
      payload: { checkpoint_id: cp.id, kind: cp.kind, key: cp.key },
    })

    fired++
  }

  return json({ ok: true, fired, checked: (due ?? []).length })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
