import{n as e}from"./rolldown-runtime-QTnfLwEv.js";import"./brand-BpCPiwSe.js";var t=e({formatInvoiceUsd:()=>o,hasInvoicePlaceholderCopy:()=>i,invoiceEmailSubject:()=>a,invoicePoDisplay:()=>n,isInvoicePoPlaceholder:()=>r,renderInvoiceEmailHtml:()=>s,renderInvoiceEmailText:()=>c});function n(e){let t=(e??``).trim();return t?t.replace(/^PO\s*#?\s*/i,``).trim()||t:``}function r(e){let t=n(e).replace(/^[(\[{]+|[)\]}]+$/g,``).trim();return!t||/^(INSERT\s*INVOICE|ENTER\s*(PO|INVOICE|TAIL|FBO|ETA)|TBD|TODO|N\/?A)$/i.test(t)}function i(e){let t=String(e??``);return t.trim()?/\(\s*ENTER[^)]*\)/i.test(t)||/\bENTER\s+(TAIL|FBO|ETA|DEP|ARR|HH|SIT|RETURN)\b/i.test(t)||/\bADD SIT TIME\b/i.test(t):!1}function a(e){let t=n(e.poNumber),i=(e.laneShort??``).trim(),a=(e.tail??``).trim().toUpperCase();return[`OnFly invoice`,t&&!r(t)?`PO #${t}`:null,i||null,a||null].filter(Boolean).join(` · `)}function o(e){return(Math.round(e*100)/100).toLocaleString(`en-US`,{style:`currency`,currency:`USD`,minimumFractionDigits:2})}function s(e){let t=u(n(e.poNumber)||`—`),r=u(e.laneShort.trim()||`—`),a=u(e.phone?.trim()||`(858) 529-7860`),s=u(e.supportEmail?.trim()||`info@onflyair.com`),c=e.portalUrl.trim(),f=d(c),p=u(l(c)),m=e.logoUrl?.trim(),h=m?`<img src="${d(m)}" alt="OnFly Air" width="160" style="display:block;max-width:160px;height:auto;border:0" />`:`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.14em;color:#c9a227">ONFLYAIR</div>`,g=u(e.aircraftType.trim()||`TBD`),_=u(e.aircraftBlurb?.trim()||`Cargo configuration`),v=u(e.tail.trim().toUpperCase()||`TBD`),y=u(e.patternLabel.trim()||`AIRPORT → AIRPORT`),b=u(e.preparedLabel.trim()),x=u(e.timezoneNote?.trim()||`Stop-local times · Zulu in parentheses`),S=e.amountUsd!=null&&Number.isFinite(e.amountUsd)?o(e.amountUsd):null,C=e.payUrl?.trim(),w=e.contractUrl?.trim(),T=e.clientName?.trim(),E=e.flightDate?.trim()||null,D=(e.itineraryLines??[]).map(e=>e.trim()).filter(e=>e&&!i(e)),O=(e.detailLines??[]).map(e=>e.trim()).filter(e=>e&&!i(e)),k=[t&&t!==`—`?`PO #: ${n(e.poNumber)}`:null,e.tail?.trim()?`Tail Number: ${e.tail.trim().toUpperCase()}`:null,e.laneShort?.trim()?`Route: ${e.laneShort.trim()}`:null,E?`Date: ${E}`:null,e.aircraftType?.trim()?`Aircraft: ${e.aircraftType.trim()}`:null,D.length?`Trip Itinerary`:null,...D,...O].filter(e=>!!e),A=k.length>0?`<tr>
          <td style="padding:22px;border-bottom:1px solid #e8e4dc;background:#ffffff">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">TRIP DETAILS</div>
            ${k.map(e=>`<div style="margin-top:6px;font-size:14px;color:#0c0c0e;line-height:1.45;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${u(e)}</div>`).join(``)}
          </td>
        </tr>`:``,j=e=>{let t=e.kind===`pickup`?`PICKUP`:`DROP-OFF`,n=e.placeBadge?.trim(),r=e.addressLines.map(e=>e.trim()).filter(Boolean);return`<tr>
      <td style="padding:0 0 10px;vertical-align:top">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:10px">
          <tr><td style="padding:14px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0;vertical-align:middle">
                  <span style="display:inline-block;background:#0c0c0e;color:#f7f2e3;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:999px">${t}</span>
                </td>
                ${n?`<td style="padding:0 0 0 6px;vertical-align:middle">
                  <span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:999px">${u(n)}</span>
                </td>`:``}
              </tr>
            </table>
            <div style="margin-top:10px;font-size:15px;font-weight:700;color:#0c0c0e;line-height:1.35">${u(e.title)}</div>
            ${r.map(e=>`<div style="margin-top:4px;font-size:13px;color:#5c5852;line-height:1.45">${u(e)}</div>`).join(``)}
            ${e.footer?.trim()?`<div style="margin-top:10px;font-size:12px;color:#0c0c0e;line-height:1.45">${u(e.footer.trim())}</div>`:``}
          </td></tr>
        </table>
      </td>
    </tr>`},M=e.milestones.map((e,t)=>{let n=e.actual?.trim(),r=n?`<span style="color:#0c0c0e;font-weight:600">${u(n)}</span>`:`<span style="color:#9a948a;font-style:italic">— live on portal</span>`;return`<tr>
        <td style="padding:14px 12px;border-top:1px solid ${t===0?`#e5e5e5`:`#ececec`};vertical-align:top">
          <div style="font-size:14px;font-weight:700;color:#0c0c0e">${u(e.label)}</div>
          ${e.detail?.trim()?`<div style="margin-top:3px;font-size:12px;color:#6b6560;line-height:1.4">${u(e.detail.trim())}</div>`:``}
        </td>
        <td style="padding:14px 12px;border-top:1px solid ${t===0?`#e5e5e5`:`#ececec`};vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#0c0c0e;white-space:nowrap">${u(e.projected||`—`)}</td>
        <td style="padding:14px 12px;border-top:1px solid ${t===0?`#e5e5e5`:`#ececec`};vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px">${r}</td>
      </tr>`}).join(``),N=C?`<a href="${d(C)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px">View and pay →</a>`:`<span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px">Open attached PDF to pay</span>`;return`<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:0">
    <tr>
      <td style="background:#0c0c0e;padding:22px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle">${h}</td>
            <td align="right" style="vertical-align:middle">
              <span style="display:inline-block;border:1px solid rgba(201,162,39,0.45);border-radius:999px;padding:6px 12px;font-size:11px;color:#f7f2e3;letter-spacing:0.02em">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2E7D32;margin-right:6px;vertical-align:middle"></span>
                24-hr ops · ${a}
              </span>
            </td>
          </tr>
        </table>
        <div style="margin-top:22px;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#c9a227">INVOICE</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
          <tr>
            <td style="vertical-align:top">
              <div style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.2">PO #${t} · ${r}</div>
              <div style="margin-top:8px;font-size:13px;color:#b8b2a6;line-height:1.45">${b}${T?` · ${u(T)}`:``} — trip details below; track live on your portal.</div>
            </td>
            <td align="right" style="vertical-align:top;padding-left:12px">
              <span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:10px;font-weight:700;letter-spacing:0.1em;padding:6px 10px;border-radius:6px">${y}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr><td align="center" style="padding:0 12px">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff">
        <tr>
          <td style="padding:22px 22px 18px;background:#ffffff;border-bottom:1px solid #e8e4dc">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">BALANCE DUE</div>
            ${S?`<div style="margin-top:8px;font-size:34px;font-weight:700;color:#0c0c0e;line-height:1.1">${u(S)}</div>`:`<div style="margin-top:8px;font-size:18px;font-weight:700;color:#0c0c0e">See attached PDF</div>`}
            <div style="margin-top:8px;font-size:13px;color:#6b6560;line-height:1.45">
              Open the attached PDF invoice for full line items. ACH available online.
            </div>
            <div style="margin-top:16px">${N}</div>
            ${w?`<div style="margin-top:16px;font-size:13px;line-height:1.45">
              <div style="font-weight:700;color:#0c0c0e;margin-bottom:4px">Please sign the charter contract</div>
              <a href="${d(w)}" style="color:#1a56db;text-decoration:underline;word-break:break-all">${u(w)}</a>
            </div>`:``}
          </td>
        </tr>

        ${A}

        <tr>
          <td style="padding:0;border-bottom:1px solid #e8e4dc">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding:20px 22px;border-right:1px solid #e8e4dc;vertical-align:top">
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">AIRCRAFT</div>
                  <div style="margin-top:8px;font-size:22px;font-weight:700;color:#0c0c0e">${g}</div>
                  <div style="margin-top:4px;font-size:12px;color:#6b6560">${_}</div>
                </td>
                <td style="width:50%;padding:20px 22px;vertical-align:top">
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">TAIL NUMBER</div>
                  <div style="margin-top:8px;font-size:22px;font-weight:700;color:#0c0c0e;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${v}</div>
                  <div style="margin-top:4px;font-size:12px;color:#6b6560">
                    <a href="${f}" style="color:#1a56db;text-decoration:underline">Track this tail live on your portal</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 14px;background:#f3f1eb">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${j(e.pickup)}
              ${j(e.dropoff)}
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 22px 8px">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#0c0c0e">PROJECTED TIMELINE</div>
            <div style="margin-top:4px;font-size:11px;color:#6b6560;line-height:1.4">${x}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse">
              <tr>
                <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700">MILESTONE</th>
                <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700">PROJECTED</th>
                <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700">ACTUAL</th>
              </tr>
              ${M||`<tr><td colspan="3" style="padding:14px 12px;border-top:1px solid #e5e5e5;font-size:13px;color:#6b6560;font-style:italic">Timeline fills in on your portal as the trip progresses.</td></tr>`}
            </table>
            <p style="margin:14px 0 0;font-size:12px;color:#6b6560;line-height:1.45">
              Projections assume current winds and slot times. If any milestone slips more than 15 minutes, dispatch calls your urgent number.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr>
      <td align="center" style="padding:0 12px 0">
        <table role="presentation" width="100%" style="max-width:640px;background:#0c0c0e">
          <tr>
            <td style="padding:22px 22px;vertical-align:middle">
              <div style="font-size:18px;font-weight:700;color:#ffffff">Watch it move, live</div>
              <div style="margin-top:6px;font-size:13px;color:#b8b2a6;line-height:1.45;max-width:320px">
                Your portal shows live ADS-B position and milestone actuals as they fill in.
              </div>
            </td>
            <td align="right" style="padding:22px 22px;vertical-align:middle">
              <a href="${f}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:14px;font-weight:700;padding:12px 16px;border-radius:8px">Open live tracking portal →</a>
              <div style="margin-top:10px;font-size:11px;color:#8a847a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all">${p}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:18px 16px 28px">
        <div style="font-size:12px;color:#6b6560">
          OnFly Air · 24-hr ops ${a} ·
          <a href="mailto:${s}" style="color:#1a56db;text-decoration:underline">${s}</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`}function c(e){let t=n(e.poNumber)||`—`,r=e.amountUsd!=null&&Number.isFinite(e.amountUsd)?o(e.amountUsd):null,a=(e.itineraryLines??[]).map(e=>e.trim()).filter(e=>e&&!i(e)),s=(e.detailLines??[]).map(e=>e.trim()).filter(e=>e&&!i(e));return[`OnFly invoice — PO #${t} · ${e.laneShort}`,e.preparedLabel,e.clientName?.trim()||null,r?`Balance due: ${r}`:null,e.payUrl?.trim()?`View and pay: ${e.payUrl.trim()}`:null,``,`Aircraft: ${e.aircraftType}`,`Tail Number: ${e.tail}`,e.laneShort?.trim()?`Route: ${e.laneShort.trim()}`:null,e.flightDate?.trim()?`Date: ${e.flightDate.trim()}`:null,``,a.length?`Trip Itinerary`:null,...a,...s,``,`PICKUP`,e.pickup.title,...e.pickup.addressLines,e.pickup.footer||null,``,`DROP-OFF`,e.dropoff.title,...e.dropoff.addressLines,e.dropoff.footer||null,``,`Projected timeline`,...e.milestones.length?e.milestones.map(e=>`${e.label}: ${e.projected||`—`} | Actual: ${e.actual?.trim()||`live on portal`}`):[`Timeline fills in on your portal.`],``,`Open live tracking portal: ${e.portalUrl}`,e.contractUrl?.trim()?`Charter contract: ${e.contractUrl.trim()}`:null,``,`OnFly Air · 24-hr ops ${e.phone||`(858) 529-7860`} · ${e.supportEmail||`info@onflyair.com`}`].filter(e=>e!=null&&e!==``).join(`
`)}function l(e){try{let t=new URL(e);return`${t.host}${t.pathname}`.replace(/\/$/,``)}catch{return e.replace(/^https?:\/\//i,``)}}function u(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function d(e){return u(e).replace(/'/g,`&#39;`)}export{r as a,n as i,a as n,s as o,t as r,c as s,i as t};