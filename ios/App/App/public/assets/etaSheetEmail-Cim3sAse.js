import"./brand-BpCPiwSe.js";function e(e){let t=e.poNumber.trim()||`Trip`,n=e.laneShort.trim(),r=e.tail?.trim();return[`OnFly ETA sheet`,t?`PO #${t.replace(/^PO\s*#?\s*/i,``)}`:null,n||null,r||null].filter(Boolean).join(` · `)}function t(e){switch((e??``).toUpperCase()){case`D2D`:return`Door to door`;case`D2A`:return`Door to airport`;case`A2D`:return`Airport to door`;case`A2A`:return`Airport to airport`;default:return`Airport to airport`}}function n(e){let t=e.replace(/[^A-Z0-9]/g,``);return t.length===4&&t.startsWith(`K`)?t.slice(1):t||e}function r(e){let t=e.split(/\s*(?:→|->|–|—)\s*/).map(e=>e.trim().toUpperCase()).filter(Boolean);return t.length<2?e.trim()||`—`:`${n(t[0])} → ${n(t[t.length-1])}`}function i(e){let t=e.trim();if(!t)return`—`;let r=t.split(/\s*·\s*/).map(e=>e.trim()).filter(Boolean),i=e=>{let t=e.split(/\s*(?:→|->|–|—)\s*/).map(e=>e.trim().toUpperCase()).filter(Boolean);return t.length?t.map(n).join(` → `):e};return r.length>1?r.map(i).join(` · `):i(t)}function a(e){let t=c(e.poNumber.replace(/^PO\s*#?\s*/i,``).trim()||e.poNumber.trim()||`—`),n=c(e.laneShort.trim()||`—`),r=c(e.phone?.trim()||`(858) 529-7860`),i=c(e.supportEmail?.trim()||`info@onflyair.com`),a=e.portalUrl.trim(),o=l(a),u=c(s(a)),d=e.logoUrl?.trim(),f=d?`<img src="${l(d)}" alt="OnFly Air" width="148" style="display:block;max-width:148px;height:auto;border:0;background:transparent" />`:`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.14em"><span style="color:#c9a227">ONFLY</span> <span style="color:#f7f2e3">AIR</span></div>`,p=c(e.aircraftType.trim()||`TBD`),m=c(e.aircraftBlurb?.trim()||`Cargo configuration`),h=c(e.tail.trim().toUpperCase()||`TBD`),g=c(e.patternLabel.trim()||`Airport to airport`),_=c(e.preparedLabel.trim()),v=c(e.timezoneNote?.trim()||`Stop-local times · Zulu in parentheses`),y=c(e.etaDisclosure?.trim()||`All ETAs are estimates and may change for weather, ATC, passenger or cargo readiness, loading, or safety of flight. Live stage progress is on your tracking portal.`),b=e=>{let t=e.kind===`pickup`?`PICKUP`:`DROP-OFF`,n=e.placeBadge?.trim(),r=e.addressLines.map(e=>e.trim()).filter(Boolean);return`<tr>
      <td style="padding:0 0 10px;vertical-align:top">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px">
          <tr><td style="padding:14px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td style="padding:0;vertical-align:middle">
                  <span style="display:inline-block;background:#0c0c0e;color:#f7f2e3;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:4px">${t}</span>
                </td>
                ${n?`<td style="padding:0 0 0 6px;vertical-align:middle">
                  <span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:4px">${c(n)}</span>
                </td>`:``}
              </tr>
            </table>
            <div style="margin-top:10px;font-size:16px;font-weight:700;color:#0c0c0e;line-height:1.35">${c(e.title)}</div>
            ${r.map(e=>`<div style="margin-top:4px;font-size:13px;color:#6b6560;line-height:1.45">${c(e)}</div>`).join(``)}
            ${e.footer?.trim()?`<div style="margin-top:10px;font-size:12px;color:#0c0c0e;line-height:1.45">${c(e.footer.trim())}</div>`:``}
          </td></tr>
        </table>
      </td>
    </tr>`},x=e.milestones.length>0?e.milestones.map((e,t)=>{let n=(e.actual?.trim()||e.projected?.trim()||``).trim(),r=e.actual?.trim()?`Actual`:n?`ETA`:`Portal`,i=e.actual?.trim()?`#2e7d32`:n?`#0c0c0e`:`#6b6560`;return`<tr style="${t%2==0?`background:#fffdf8`:`background:#ffffff`}">
        <td style="padding:12px 14px;border-top:1px solid #e5dfd0;vertical-align:top;width:58%">
          <div style="font-size:14px;font-weight:700;color:#0c0c0e;line-height:1.35;word-break:break-word">${c(e.label)}</div>
          ${e.detail?.trim()?`<div style="margin-top:3px;font-size:12px;color:#6b6560;line-height:1.4">${c(e.detail.trim())}</div>`:``}
        </td>
        <td style="padding:12px 14px;border-top:1px solid #e5dfd0;vertical-align:top;text-align:right;width:42%">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b6560">${r}</div>
          <div style="margin-top:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;color:${i};line-height:1.35;word-break:break-word">${c(n||`Live on portal`)}</div>
        </td>
      </tr>`}).join(``):`<tr><td colspan="2" style="padding:18px 14px;border-top:1px solid #e5dfd0;font-size:13px;color:#6b6560">
        Open the portal for live stage progress, aircraft position, and tail.
      </td></tr>`;return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>OnFly ETA sheet · PO #${t}</title>
  <style type="text/css">
    /* iOS / Apple Mail — keep layout tight on narrow screens */
    @media only screen and (max-width: 620px) {
      .of-pad { padding-left: 12px !important; padding-right: 12px !important; }
      .of-tail { font-size: 28px !important; letter-spacing: 0.04em !important; }
      .of-po { font-size: 22px !important; }
      .of-lane { font-size: 15px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e;-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3">
    <tr>
      <td class="of-pad" style="background:#0c0c0e;padding:14px 16px;border-bottom:3px solid #c9a227">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e">
          <tr>
            <td style="vertical-align:middle;background:#0c0c0e;padding:0 0 8px 0">${f}</td>
          </tr>
          <tr>
            <td style="vertical-align:middle;font-size:11px;color:#f7f2e3;letter-spacing:0.04em;background:#0c0c0e;line-height:1.4">
              24-hr ops &nbsp;<span style="color:#c9a227;font-weight:700;letter-spacing:0">${r}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:0">
        <table role="presentation" width="100%" style="max-width:720px">
          <tr>
            <td class="of-pad" style="padding:20px 16px 8px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c9a227">${g}</div>
              <div class="of-po" style="margin-top:6px;font-size:24px;font-weight:700;color:#0c0c0e;line-height:1.2;letter-spacing:-0.02em">PO #${t}</div>
              <div class="of-lane" style="margin-top:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;font-weight:700;color:#0c0c0e;line-height:1.4;word-break:break-word">${n}</div>
              <div style="margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b6560;line-height:1.4">${_}</div>
              <div style="margin-top:6px;font-size:12px;color:#6b6560;line-height:1.45">
                Track aircraft position and live stage progress on your portal.
              </div>
            </td>
          </tr>

          <tr>
            <td class="of-pad" style="padding:10px 16px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px;overflow:hidden">
                <tr>
                  <td style="padding:12px 16px 2px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#c9a227">Aircraft</td>
                </tr>
                <tr>
                  <td style="padding:2px 16px 4px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(247,242,227,0.55)">Live portal below</td>
                </tr>
                <tr>
                  <td style="padding:6px 16px 16px">
                    <div class="of-tail" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:30px;font-weight:800;letter-spacing:0.05em;line-height:1.15;color:#c9a227;word-break:break-word">${h}</div>
                    <div style="margin-top:8px;font-size:14px;font-weight:600;color:#f7f2e3;line-height:1.35">${p.toUpperCase()}</div>
                    <div style="margin-top:4px;font-size:12px;color:rgba(247,242,227,0.65);line-height:1.4">${c(m)} &middot; ${n}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="of-pad" style="padding:4px 16px 8px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${b(e.pickup)}
                ${b(e.dropoff)}
              </table>
            </td>
          </tr>

          <tr>
            <td class="of-pad" style="padding:0 16px 16px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px;overflow:hidden">
                <tr>
                  <td style="padding:12px 14px 4px;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6b6560">
                    Trip stages &amp; ETAs
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 14px 10px;font-size:11px;color:#6b6560;line-height:1.4">
                    ${v}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;border-top:1px solid #e5dfd0">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                      ${x}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:12px;color:#6b6560;line-height:1.5">
                ${y}
              </p>
            </td>
          </tr>

          <tr>
            <td class="of-pad" style="padding:0 16px 20px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px">
                <tr>
                  <td style="padding:18px 16px 8px">
                    <div style="font-size:16px;font-weight:700;color:#f7f2e3;line-height:1.3">Open your tracking portal</div>
                    <div style="margin-top:6px;font-size:13px;color:#b8b2a6;line-height:1.45">
                      Live aircraft position and stage progress update as the trip moves.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 16px 18px">
                    <a href="${o}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:13px;font-weight:700;padding:12px 16px;border-radius:6px">Open tracking portal &rarr;</a>
                    <div style="margin-top:10px;font-size:11px;color:#8a847a;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;line-height:1.4">${u}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" class="of-pad" style="padding:8px 16px 28px;border-top:1px solid #e5dfd0">
        <div style="font-size:12px;color:#6b6560;line-height:1.6">
          <a href="https://onflyair.com" style="color:#6b6560;text-decoration:none">onflyair.com</a>
          <br />
          <span style="color:#c9a227">${r}</span>
          &nbsp;&middot;&nbsp;
          <a href="mailto:${i}" style="color:#0c0c0e;text-decoration:underline">${i}</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`}function o(e){let t=e.poNumber.replace(/^PO\s*#?\s*/i,``).trim()||e.poNumber,n=e.etaDisclosure?.trim()||`All ETAs are estimates and may change for weather, ATC, passenger or cargo readiness, loading, or safety of flight. Live stage progress is on your tracking portal.`;return[`OnFly ETA sheet — PO #${t}`,`Route: ${e.laneShort}`,e.patternLabel,e.preparedLabel,``,`TAIL: ${e.tail}`,`Aircraft: ${e.aircraftType}`,``,`PICKUP`,e.pickup.title,...e.pickup.addressLines,e.pickup.footer||null,``,`DROP-OFF`,e.dropoff.title,...e.dropoff.addressLines,e.dropoff.footer||null,``,`Trip stages & ETAs`,...e.milestones.map(e=>{let t=e.actual?.trim()||e.projected?.trim()||`Live on portal`;return`${e.label}: ${t}`}),``,n,``,`Open tracking portal: ${e.portalUrl}`,``,`OnFly Air · 24-hr ops ${e.phone||`(858) 529-7860`} · ${e.supportEmail||`info@onflyair.com`}`].filter(e=>e!=null).join(`
`)}function s(e){try{let t=new URL(e);return`${t.host}${t.pathname}`.replace(/\/$/,``)}catch{return e.replace(/^https?:\/\//i,``)}}function c(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function l(e){return c(e).replace(/'/g,`&#39;`)}export{o as a,a as i,i as n,r as o,t as r,e as t};