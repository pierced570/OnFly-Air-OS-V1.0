/**
 * LLM helpers — Anthropic Claude (preferred) with optional OpenAI fallback.
 * Secrets: ANTHROPIC_API_KEY (preferred), OPENAI_API_KEY (legacy fallback)
 * Optional: ANTHROPIC_MODEL (default claude-sonnet-4-5-20250929)
 *
 * Deploy: npm run deploy:vendors
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Body = {
  mode: 'extract_trip' | 'plain_english' | 'extract_d085'
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

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!anthropicKey && !openaiKey) {
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const body = (await req.json()) as Body
    const text = String(body.text ?? '').trim()
    if (!text) return json({ error: 'text required' }, 400)
    const mode = body.mode ?? 'extract_trip'

    const complete = anthropicKey
      ? (system: string, user: string, jsonMode: boolean) =>
          anthropicChat(anthropicKey, system, user, jsonMode)
      : (system: string, user: string, jsonMode: boolean) =>
          openaiChat(openaiKey!, system, user, jsonMode)

    if (mode === 'plain_english') {
      const out = await complete(
        'You rewrite aviation NOTAMs and weather notes into short plain English for charter dispatchers. No fluff. Keep numbers and ICAOs.',
        body.context ? `Context: ${body.context}\n\nText:\n${text}` : text,
        false,
      )
      return json({ text: out, provider: anthropicKey ? 'anthropic' : 'openai' })
    }

    if (mode === 'extract_d085') {
      const raw = await complete(
        `Extract aircraft from an FAA D085 / ops specs listing.
Return JSON: { "aircraft": [ { "tail": "N123AB", "type_name": "King Air 200" } ] }
Rules: US N-numbers only; type_name = make/model as written; skip duplicates; omit rows without a tail.
Reply JSON only.`,
        text.slice(0, 20000),
        true,
      )
      let parsed: { aircraft?: unknown }
      try {
        parsed = JSON.parse(raw)
      } catch {
        const m = raw.match(/\{[\s\S]*\}/)
        parsed = m ? JSON.parse(m[0]) : { aircraft: [] }
      }
      const aircraft = Array.isArray(parsed.aircraft)
        ? parsed.aircraft
            .map((row) => {
              const r = row as { tail?: string; type_name?: string; type?: string }
              return {
                tail: String(r.tail ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
                type_name: String(r.type_name ?? r.type ?? '').trim(),
              }
            })
            .filter((r) => r.tail.startsWith('N'))
        : []
      return json({
        aircraft,
        provider: anthropicKey ? 'anthropic' : 'openai',
      })
    }

    const raw = await complete(
      `Extract a charter/air-freight trip request as JSON with keys:
pieces_text, origin_text, destination_text, ready_local, deadline_local,
hazmat (boolean), pax_count (number|null), payload_kind ("cargo"|"pax"|"both"),
notes. Use null/omit when unknown. ready_local/deadline_local as local ISO-like strings if present. Reply JSON only.`,
      text.slice(0, 12000),
      true,
    )
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : { notes: 'parse_failed', raw_model: raw }
    }
    return json({
      ...parsed,
      raw: text,
      provider: anthropicKey ? 'anthropic' : 'openai',
    })
  } catch (e) {
    console.error('[llm-extract]', e)
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

async function anthropicChat(
  apiKey: string,
  system: string,
  user: string,
  jsonMode: boolean,
): Promise<string> {
  const model =
    Deno.env.get('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-5-20250929'
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: jsonMode
        ? `${system}\n\nRespond with a single JSON object only.`
        : system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (payload as { error?: { message?: string } })?.error?.message ??
        `Anthropic HTTP ${res.status}`,
    )
  }
  const blocks = (payload as { content?: { type?: string; text?: string }[] })
    .content ?? []
  return blocks
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n')
}

async function openaiChat(
  apiKey: string,
  system: string,
  user: string,
  jsonMode: boolean,
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
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
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
