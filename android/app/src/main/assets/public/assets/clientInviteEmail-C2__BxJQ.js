import{n as e}from"./rolldown-runtime-QTnfLwEv.js";import{a as t,i as n,r,s as i,t as a}from"./brand-BpCPiwSe.js";import{t as o}from"./email-CZllKn47.js";function s(e){return{buttonText:`Complete your client setup`,onboardUrl:`/client`,logoUrl:``,fullLogoUrl:``,phone:t,supportEmail:a,tagline:i,intro:`Thank you for choosing OnFly Air. When freight can't wait, we arrange the aircraft — a vetted Part 135 carrier network, pilot-led dispatch, and ETAs you can hold us to.`,closingMessage:`Once your profile is in, your team can request trips from the portal, follow live status on every shipment, and receive delivery confirmations automatically.`,...e}}function c(e){let t=e.companyName?.trim();return t?`Welcome to OnFly Air — complete your setup (${t})`:`Welcome to OnFly Air — complete your client setup`}function l(e){let t=e.recipientName?.trim()?`Hello ${e.recipientName.trim()},`:`Hello,`,n=e.companyName?.trim()||`your company`,r=`This setup is for ${n}. It takes a few minutes and puts your contacts, billing, and routing preferences on file — so when you need us, we quote first and ask questions never.`;return[`ONFLY Air`,e.tagline,``,`Welcome to OnFly Air`,``,t,``,e.intro,``,r,``,`${e.buttonText}: ${e.onboardUrl}`,``,e.closingMessage,``,`Questions? Reply to this email or call ${e.phone} — you'll get a dispatcher, not a phone tree.`,``,`${e.phone} · ${e.supportEmail}`,``,`You received this because ${n} is being set up as an OnFly Air client.`].join(`
`)}function u(e){let t=e.recipientName?.trim()?`Hello ${d(e.recipientName.trim())},`:`Hello,`,n=d(e.companyName?.trim()||`your company`),r=(e.fullLogoUrl||e.logoUrl).trim();return`<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ebe6d8;font-family:Georgia,'Times New Roman',serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ebe6d8;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#f7f2e3;border-radius:4px;overflow:hidden;border:1px solid #ddd6c4">
        <tr><td style="background:#0c0c0e;padding:28px 28px 24px;text-align:center">
          ${r?`<img src="${f(r)}" width="240" height="86" alt="OnFly Air" style="display:block;margin:0 auto 10px;border:0;max-width:240px;height:auto" />`:`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.1;font-weight:700;letter-spacing:0.08em;color:#f7f2e3">ONFLY AIR</div>`}
          <div style="margin-top:10px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;color:#c9a227;font-weight:600">
            ${d(e.tagline)}
          </div>
        </td></tr>
        <tr><td style="padding:36px 28px 8px;background:#f7f2e3">
          <h1 style="margin:0 0 22px;font-size:28px;line-height:1.25;color:#0c0c0e;font-weight:700;font-family:Georgia,'Times New Roman',serif">
            Welcome to OnFly Air
          </h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#0c0c0e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${t}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            ${d(e.intro)}
          </p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            This setup is for <strong style="color:#0c0c0e">${n}</strong>. It takes a few minutes and puts your contacts, billing, and routing preferences on file — so when you need us, we quote first and ask questions never.
          </p>
        </td></tr>
        <tr><td style="padding:20px 28px 8px;text-align:center;background:#f7f2e3">
          <a href="${f(e.onboardUrl)}"
             style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700;font-size:15px;padding:14px 28px;border-radius:6px">
            ${d(e.buttonText)}
          </a>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b6560;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;word-break:break-all">
            Button not working? Copy this link:<br/>
            <a href="${f(e.onboardUrl)}" style="color:#a8882a;text-decoration:underline">${d(e.onboardUrl)}</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 28px 32px;background:#f7f2e3">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            ${d(e.closingMessage)}
          </p>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            Questions? Reply to this email or call
            <a href="tel:+18585297860" style="color:#c9a227;text-decoration:none;font-weight:700">${d(e.phone)}</a>
            — you&apos;ll get a dispatcher, not a phone tree.
          </p>
        </td></tr>
        <tr><td style="background:#0c0c0e;padding:22px 28px;text-align:center">
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:#c9a227">
            ${d(e.phone)} · ${d(e.supportEmail)}
          </div>
        </td></tr>
        <tr><td style="background:#e5dfd0;padding:14px 28px;text-align:center">
          <p style="margin:0;font-size:11px;line-height:1.5;color:#6b6560;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            You received this because ${n} is being set up as an OnFly Air client.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`}function d(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function f(e){return d(e).replace(/'/g,`&#39;`)}var p=e({buildClientInviteTemplate:()=>y,resolveBrandLogoUrl:()=>v,resolveBrandMarkUrl:()=>_,resolveClientOnboardUrl:()=>h,sendClientOnboardInvite:()=>b});function m(){return((typeof window<`u`?window.location.origin:``)||``).replace(/\/$/,``)}function h(e){if(e?.trim())return e.trim();let t=m();return t?`${t}/client`:`/client`}function g(e,t){if(t?.trim())return t.trim();let n=m();return n?`${n}${e}`:e}function _(e){return e?.trim(),g(n,e)}function v(e){return e?.trim(),g(r,e)}function y(e){let t=h(e?.onboardUrl),n=_(e?.logoUrl),r=v(e?.fullLogoUrl);return s({...e,onboardUrl:t,logoUrl:n,fullLogoUrl:r})}async function b(e){let t=e.to.trim().toLowerCase();if(!t.includes(`@`))throw Error(`Valid email required`);let n=e.companyName?.trim(),r=y({...e.template,companyName:n||e.template?.companyName,recipientName:e.recipientName?.trim()||e.template?.recipientName}),{id:i}=await o().send({to:t,subject:c({companyName:n}),html:u(r),text:l(r)});return{id:i,to:t,onboardUrl:r.onboardUrl}}export{u as a,b as i,p as n,v as r,y as t};