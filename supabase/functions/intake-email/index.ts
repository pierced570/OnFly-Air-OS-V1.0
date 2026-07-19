/**
 * Resend inbound webhook → intake_drafts + on-shift SMS.
 *
 * Configure Resend → Webhooks / inbound route to this function URL.
 * Auth: Authorization: Bearer <SUPABASE_ANON_KEY or INTAKE_WEBHOOK_SECRET>
 *
 * Deploy:
 *   npx supabase functions deploy intake-email --project-ref udowzmoswudrqtjebehr
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, resend-signature',
}

type ResendInbound = {
  type?: string
  data?: {
    email_id?: string
    message_id?: string
    from?: string | { address?: string; name?: string }
    to?: string[]
    subject?: string
    text?: string
    html?: string
  }
  // Flat fallback shapes
  from?: string
  subject?: string
  text?: string
  html?: string
  message_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST required' }, 405)
  }

  const secret = Deno.env.get('INTAKE_WEBHOOK_SECRET')
  const auth = req.headers.get('Authorization') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const url = Deno.env.get('SUPABASE_URL') ?? ''

  if (secret) {
    const ok =
      auth === `Bearer ${secret}` ||
      req.headers.get('x-intake-secret') === secret
    if (!ok) return json({ error: 'Unauthorized' }, 401)
  } else if (auth && anon && !auth.includes(anon) && !auth.includes(service)) {
    // Allow gateway JWT; reject empty only when secret unset
  }

  if (!url || !service) {
    return json({ error: 'Supabase env missing' }, 500)
  }

  let body: ResendInbound
  try {
    body = (await req.json()) as ResendInbound
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const data = body.data ?? body
  const fromRaw = data.from ?? body.from
  const from =
    typeof fromRaw === 'string'
      ? fromRaw
      : String(fromRaw?.address ?? '').trim()
  const subject = String(data.subject ?? body.subject ?? '(no subject)').trim()
  const text = String(
    data.text ?? body.text ?? stripHtml(String(data.html ?? body.html ?? '')),
  ).trim()
  const messageId = String(
    data.message_id ?? data.email_id ?? body.message_id ?? '',
  ).trim()

  if (!from.includes('@') || !text) {
    return json({ error: 'from and text required' }, 400)
  }

  const sb = createClient(url, service)

  if (messageId) {
    const { data: existing } = await sb
      .from('intake_drafts')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle()
    if (existing?.id) {
      return json({ ok: true, duplicate: true, id: existing.id })
    }
  }

  const fromEmail = from.toLowerCase().match(/[\w.+-]+@[\w.-]+/)?.[0] ?? from.toLowerCase()

  const { data: contacts } = await sb
    .from('client_contacts')
    .select('email,role,client_id')
    .ilike('email', fromEmail)

  const requesterMatch =
    (contacts ?? []).some((c) => c.role === 'requester') ||
    (contacts ?? []).length > 0

  let extracted: Record<string, unknown> | null = null
  let ignoreReason: string | null = null
  let status: 'pending_review' | 'ignored' = 'pending_review'

  if (!requesterMatch) {
    status = 'ignored'
    ignoreReason = 'sender not a known client contact'
  } else {
    extracted = heuristicExtract(`${subject}\n\n${text}`)
  }

  let notifyPhone: string | null = null
  if (status === 'pending_review') {
    const { data: shift } = await sb
      .from('shifts')
      .select('phone')
      .eq('active', true)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    notifyPhone = shift?.phone ?? Deno.env.get('FALLBACK_DISPATCH_PHONE') ?? null
  }

  const { data: draft, error } = await sb
    .from('intake_drafts')
    .insert({
      channel: 'email',
      from_addr: fromEmail,
      subject,
      body: text,
      status,
      extracted,
      ignore_reason: ignoreReason,
      notified_phone: notifyPhone,
      message_id: messageId || null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[intake-email] insert', error)
    return json({ error: error.message }, 500)
  }

  if (notifyPhone && status === 'pending_review') {
    // Best-effort SMS via mock/real is client-side; log outbound intent
    await sb.from('comms_messages').insert({
      channel: 'sms',
      direction: 'out',
      to_ref: notifyPhone,
      body: `OnFly: inbound email draft — review /intake (${fromEmail}: ${subject.slice(0, 80)})`,
      delivery_status: 'queued',
    })
  }

  return json({
    ok: true,
    id: draft?.id,
    status,
    requesterMatch,
  })
})

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function heuristicExtract(blob: string): Record<string, unknown> {
  const origin =
    blob.match(/\b([A-Z]{4})\b.*?(?:→|->|to)\s*([A-Z]{4})\b/i) ||
    blob.match(/from\s+([A-Z]{4})\s+to\s+([A-Z]{4})/i)
  return {
    origin_text: origin?.[1]?.toUpperCase(),
    destination_text: origin?.[2]?.toUpperCase(),
    ready_text: /asap/i.test(blob) ? 'ASAP' : undefined,
    notes: blob.slice(0, 2000),
    source: 'resend_inbound',
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
