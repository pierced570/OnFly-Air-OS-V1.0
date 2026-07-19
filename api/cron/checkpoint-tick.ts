/**
 * Vercel Cron → Supabase checkpoint-tick edge function.
 * Requires CRON_SECRET (optional) + VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (or SUPABASE_ANON_KEY) in Vercel env.
 */

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const base =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  if (!base || !key) {
    return Response.json({ error: 'Supabase env missing' }, { status: 500 })
  }

  const url = `${base.replace(/\/$/, '')}/functions/v1/checkpoint-tick`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  const body = await res.text()
  return new Response(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
