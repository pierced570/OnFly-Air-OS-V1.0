import{a as e}from"./brand-BpCPiwSe.js";import{r as t}from"./clientLogisticsQuote-CeCG8yCi.js";function n(e){let t=`${e.originLabel} → ${e.destLabel}`,n=e.refLabel?.trim()?` · ${e.refLabel.trim()}`:``;return`OnFly Air — ${e.title} (${t})${n}`}function r(n){let r=[`OnFly Air — ${n.title}`,`${n.originLabel} → ${n.destLabel}`,n.refLabel?.trim()?`Quote · ${n.refLabel.trim()}`:``,``];n.missionChips?.length&&r.push(n.missionChips.map(e=>e.label).join(` · `),``),n.intro?.trim()&&r.push(n.intro.trim(),``);for(let e of n.options)r.push(`${e.option_number_label} · ${e.aircraft_type}`,...e.milestones.map(e=>`${e.label}: ${e.clock}`),`${e.flight_time_label} · ${e.door_to_door_label}`,`Price: $${e.price.toLocaleString(`en-US`)} (${e.all_in_note||`All-in · taxes & fees included`})`,``);return n.acceptUrl&&r.push(`${t}: ${n.acceptUrl}`,``),r.push(`All-in includes repositioning, crew, fuel, FET & segment fees where applicable. On accept: confirmation, ETA sheet, live tracking.`,n.validityNote?.trim()||`ETAs assume ready-now. Quote valid 4 hours unless withdrawn.`,``,`Questions? 24-hr ops · ${e}`,n.dispatcherLine?.trim()||`OnFly Air dispatch · info@onflyair.com`),n.trackingHintUrl?.trim()&&r.push(``,`Once booked: ${n.trackingHintUrl}`),r.push(``,n.disclosureText?.trim()||`Operated by a vetted Part 135 carrier. OnFly Air acts as broker and is not the air carrier.`),r.filter((e,t,n)=>!(e===``&&n[t-1]===``)).join(`
`)}function i(t){let n=t.options.map(e=>s(e,t.acceptUrl)).join(``),r=`<p style="margin:10px 0 0;padding:6px 4px 0;border-top:1px solid #2a2a2e;font-size:9px;line-height:1.35;color:#8a8680">${c(t.disclosureText?.trim()||`Operated by a vetted Part 135 carrier. OnFly Air acts as broker and is not the air carrier.`)}</p>`,i=t.logoUrl?.trim()?`<img src="${l(t.logoUrl.trim())}" alt="OnFly Air" width="140" style="display:block;max-width:140px;height:auto;border:0" />`:`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:0.16em;font-weight:700;font-size:12px"><span style="color:#c9a227">ON</span><span style="color:#f7f2e3">FLY</span> <span style="color:#c9a227">AIR</span></div>`,o=t.refLabel?.trim()?`<div style="display:inline-block;border:1px solid #c9a227;color:#c9a227;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Quote · ${c(t.refLabel.trim())}</div>`:``,u=(t.missionChips??[]).map(e=>`<span style="display:inline-block;margin:0 4px 4px 0;padding:3px 8px;border-radius:999px;background:#1a1a1c;border:1px solid #2a2a2e;color:#f7f2e3;font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">${c(e.label)}</span>`).join(``),d=t.intro?.trim()||a(t.options.length),f=t.validityNote?.trim()||`ETAs assume ready-now. Quote valid 4 hours unless withdrawn.`,p=t.dispatcherLine?.trim()||`OnFly Air dispatch · info@onflyair.com`,m=t.trackingHintUrl?.trim()?`<p style="margin:12px 0 0;text-align:center;font-size:11px;color:#8a8680">
        Once booked:
        <a href="${l(t.trackingHintUrl.trim())}" style="color:#c9a227;font-weight:600">${c(t.trackingHintUrl.trim())}</a>
      </p>`:``;return`<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0c0c0e;font-family:Georgia,'Times New Roman',serif;color:#f7f2e3">
  <div style="max-width:680px;margin:0 auto;padding:20px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#141414;border:1px solid #2a2a2e;border-radius:12px;overflow:hidden">
      <tr>
        <td bgcolor="#0c0c0e" style="background:#0c0c0e;padding:18px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0c0c0e">
            <tr>
              <td bgcolor="#0c0c0e" style="vertical-align:middle;background:#0c0c0e">${i}</td>
              <td bgcolor="#0c0c0e" style="vertical-align:middle;text-align:right;background:#0c0c0e">${o}</td>
            </tr>
          </table>
          <h1 style="margin:14px 0 8px;font-size:24px;line-height:1.2;font-weight:700;color:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:-0.02em">
            ${c(t.originLabel)} → ${c(t.destLabel)}
          </h1>
          ${u?`<div style="margin:0 0 8px">${u}</div>`:``}
          <p style="margin:0;font-size:12px;line-height:1.4;color:#b8b2a6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            ${c(d)}
          </p>
        </td>
      </tr>

      <tr>
        <td bgcolor="#141414" style="background:#141414;padding:16px 16px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
          ${n||`<p style="margin:0;font-size:13px;color:#8a8680">Options will follow shortly.</p>`}

          <p style="margin:10px 4px 0;font-size:10px;line-height:1.4;color:#8a8680">
            All-in includes repositioning, crew, fuel, FET &amp; segment fees where applicable. On accept: confirmation, ETA sheet, live tracking. ${c(f)}
          </p>
        </td>
      </tr>

      <tr>
        <td bgcolor="#0c0c0e" style="background:#0c0c0e;padding:14px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            <tr>
              <td style="vertical-align:top;font-size:11px;line-height:1.45;color:#f7f2e3">
                Questions? <strong style="color:#c9a227">24-hr ops · ${c(e)}</strong>
              </td>
              <td style="vertical-align:top;text-align:right;font-size:11px;line-height:1.45;color:#b8b2a6">
                ${c(p)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${m}
    ${r}
  </div>
</body></html>`}function a(e){return e<=1?`All-in price · taxes & fees included. Click here to accept quote in portal.`:`${e} options · all-in prices. Click here to accept quote in portal.`}function o(e){return`<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-left:auto">
  <tr>
    <td bgcolor="#c9a227" style="background:#c9a227;border:1px solid #e3b341;border-radius:8px;text-align:center">
      <a href="${l(e)}" style="display:inline-block;padding:10px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;font-weight:700;line-height:1.25;letter-spacing:0.01em;color:#0c0c0e !important;text-decoration:none;white-space:normal">
        ${c(t)}
      </a>
    </td>
  </tr>
</table>`}function s(e,t){let n=e.milestones.length>0?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:4px 0;margin:0 0 10px"><tr>${e.milestones.map(e=>{let t=e.key===`delivered`;return`<td style="width:25%;vertical-align:top;background:#0c0c0e;${t?`border:1px solid #c9a227;`:`border:1px solid #2a2a2e;`}border-radius:6px;padding:6px 6px">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.06em;line-height:1.2;text-transform:uppercase;color:${t?`#c9a227`:`#8a8680`}">${c(e.label)}</div>
              <div style="margin-top:2px;font-size:14px;font-weight:700;font-family:ui-monospace,Menlo,monospace;color:#f7f2e3">${c(e.clock)}</div>
            </td>`}).join(``)}</tr></table>`:``,r=t?.trim()||null,i=r?o(r):``;return`<div style="margin:0 0 12px;padding:14px;border:1px solid #2a2a2e;border-radius:12px;background:#1c1c1f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 10px">
    <tr>
      <td style="vertical-align:baseline;padding-right:10px">
        <div style="font-size:16px;font-weight:700;color:#f7f2e3">${c(e.option_number_label)} · ${c(e.aircraft_type)}</div>
      </td>
      <td style="vertical-align:baseline;text-align:right;white-space:nowrap">
        <div style="font-size:26px;font-weight:700;letter-spacing:-0.02em;font-family:ui-monospace,Menlo,monospace;color:#f7f2e3">$${e.price.toLocaleString(`en-US`)}</div>
        <div style="margin-top:1px;font-size:10px;color:#2e7d32;font-weight:600">${c(e.all_in_note||`All taxes and fees included`)}</div>
      </td>
    </tr>
  </table>
  ${n}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>
      <td style="vertical-align:middle;font-size:11px;color:#8a8680;padding-right:10px">${c(e.flight_time_label)} · ${c(e.door_to_door_label)}</td>
      <td style="vertical-align:middle;text-align:right">${i}</td>
    </tr>
  </table>
</div>`}function c(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function l(e){return c(e).replace(/'/g,`&#39;`)}export{n as logisticsQuoteEmailSubject,i as renderLogisticsQuoteEmailHtml,r as renderLogisticsQuoteEmailText};