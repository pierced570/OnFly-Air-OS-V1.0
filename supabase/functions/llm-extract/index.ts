/**
 * OpenAI-backed extraction / plain-English helpers.
 * Secret: OPENAI_API_KEY
 *
 * Deploy: npx supabase functions deploy llm-extract --project-ref udowzmoswudrqtjebehr
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Body = {
  mode: 'extract_trip' | 'plain_english'
  text: string
  context?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
    if (!req.headers.get('Authorization')) {
      return json({ error: 'Missing Authorization' }, 401)
    }
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 500)

    const body = (await req.json()) as Body
    const text = String(body.text ?? '').trim()
    if (!text) return json({ error: 'text required' }, 400)
    const mode = body.mode ?? 'extract_trip'

    if (mode === 'plain_english') {
      const out = await chat(apiKey, [
        {
          role: 'system',
          content:
            'You rewrite aviation NOTAMs and weather notes into short plain English for charter dispatchers. No fluff. Keep numbers and ICAOs.',
        },
        {
          role: 'user',
          content: body.context
            ? `Context: ${body.context}\n\nText:\n${text}`
            : text,
        },
      ])
      return json({ text: out })
    }

    const raw = await chat(
      apiKey,
      [
        {
          role: 'system',
          content: `Extract a charter/air-freight trip request as JSON with keys:
pieces_text, origin_text, destination_text, ready_local, deadline_local,
hazmat (boolean), pax_count (number|null), payload_kind ("cargo"|"pax"|"both"),
notes. Use null/omit when unknown. ready_local/deadline_local as local ISO-like strings if present. Reply JSON only.`,
        },
        { role: 'user', content: text.slice(0, 12000) },
      ],
      true,
    )
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : { notes: 'parse_failed', raw_model: raw }
    }
    return json({ ...parsed, raw: text })
  } catch (e) {
    console.error('[llm-extract]', e)
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

async function chat(
  apiKey: string,
  messages: { role: string; content: string }[],
  jsonMode = false,
): Promise<string> {
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (payload as { error?: { message?: string } })?.error?.message ??
        `OpenAI HTTP ${res.status}`,
    )
  }
  return String(
    (payload as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content ?? '',
  )
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
