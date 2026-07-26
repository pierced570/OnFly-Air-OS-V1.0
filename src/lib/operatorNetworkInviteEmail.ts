/**
 * Short operator network invite — magic /join/:token packet link.
 */

import { createEmailAdapter } from '@/adapters/email'
import { appPublicUrl } from '@/lib/appUrl'
import {
  createOperatorInvite,
  markInviteSent,
} from '@/lib/operatorInviteStore'

export function joinPacketUrl(
  token: string,
  opts?: { email?: string; companyName?: string },
): string {
  const base = appPublicUrl()
  const path = `/join/${token}`
  const qs = new URLSearchParams()
  if (opts?.email?.trim()) qs.set('email', opts.email.trim().toLowerCase())
  if (opts?.companyName?.trim()) qs.set('company', opts.companyName.trim())
  const q = qs.toString()
  const full = q ? `${path}?${q}` : path
  return base ? `${base}${full}` : full
}

export function renderShortNetworkInviteHtml(opts: {
  companyName?: string
  joinUrl: string
  phone?: string
}): string {
  const phone = opts.phone ?? '(858) 529-7860'
  const hello = opts.companyName?.trim()
    ? `Hi ${escapeHtml(opts.companyName.trim())} —`
    : 'Hi —'
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f0e8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5dfd0">
        <tr><td style="background:#0c0c0e;padding:18px 22px;text-align:center">
          <img src="https://onflyair.com/wp-content/uploads/2024/02/onflyair-ff-01.png" alt="OnFly Air" width="180" style="display:block;margin:0 auto;max-width:180px;height:auto;border:0" />
        </td></tr>
        <tr><td style="padding:24px 24px 8px">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#0c0c0e">${hello}</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2a2a2e">
            We’d like to add you to our Part 135 network. One short form — upload Charter Certificate, D085, and COI, tell us how to reach you for quotes, and drop ACH / wire details for payment.
          </p>
        </td></tr>
        <tr><td style="padding:8px 24px 24px;text-align:center">
          <a href="${escapeAttr(opts.joinUrl)}"
             style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">
            Open network packet
          </a>
          <p style="margin:14px 0 0;font-size:13px;line-height:1.45;color:#6b6560">
            Takes a few minutes. Questions? Reply or call ${escapeHtml(phone)}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function renderShortNetworkInviteText(opts: {
  companyName?: string
  joinUrl: string
  phone?: string
}): string {
  const phone = opts.phone ?? '(858) 529-7860'
  const hello = opts.companyName?.trim()
    ? `Hi ${opts.companyName.trim()} —`
    : 'Hi —'
  return [
    hello,
    '',
    'We’d like to add you to our Part 135 network. One short form: Charter Certificate, D085, COI, how to reach you for quotes, and ACH / wire for payment.',
    '',
    `Open network packet: ${opts.joinUrl}`,
    '',
    `Questions? Reply or call ${phone}.`,
    '',
    'OnFly Air',
  ].join('\n')
}

export async function sendNetworkPacketInvite(opts: {
  to: string
  companyName?: string
}): Promise<{ id: string; to: string; joinUrl: string; token: string }> {
  const invite = createOperatorInvite({
    email: opts.to,
    company_name: opts.companyName,
  })
  const joinUrl = joinPacketUrl(invite.token, {
    email: invite.email,
    companyName: invite.company_name || undefined,
  })
  const email = createEmailAdapter()
  const company = opts.companyName?.trim()
  const { id } = await email.send({
    to: invite.email,
    subject: company
      ? `OnFly — network packet for ${company}`
      : 'OnFly — quick network packet',
    html: renderShortNetworkInviteHtml({
      companyName: company,
      joinUrl,
    }),
    text: renderShortNetworkInviteText({
      companyName: company,
      joinUrl,
    }),
  })
  markInviteSent(invite.token)
  return { id, to: invite.email, joinUrl, token: invite.token }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}
