import{n as e}from"./rolldown-runtime-QTnfLwEv.js";import"./brand-BpCPiwSe.js";import{h as t,w as n}from"./tripStore-D9WXpvF-.js";import{t as r}from"./appUrl-w7zb50hS.js";import{t as i}from"./email-CZllKn47.js";import{a,i as o,n as s,t as c}from"./etaSheetEmail-Cim3sAse.js";import{t as l}from"./buildEtaSheetEmail-kpogGonx.js";import{t as u}from"./etaSheet-tnrct7Bw.js";import{t as d}from"./portalTrackStore-DHoJPJF3.js";function f(e){let t=(e.priorSubject??``).trim();return t?/^re:\s*/i.test(t)?t:`Re: ${t}`:`Re: ${c({poNumber:e.poNumber,laneShort:e.laneShort,tail:e.tail})}`}function p(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function m(e){return p(e).replace(/'/g,`&#39;`)}function h(e){try{return new URL(e).host}catch{return e}}function g(e){let t=e.replace(/\r\n/g,`
`).trim().split(/\n{2,}/).map(e=>e.trim()).filter(Boolean);return t.length?t.map(e=>`<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0c0c0e">${p(e).replace(/\n/g,`<br />`)}</p>`).join(``):`<p style="margin:0;font-size:15px;line-height:1.55;color:#0c0c0e">—</p>`}function _(e){let t=p(e.poNumber.replace(/^PO\s*#?\s*/i,``).trim()||`—`),n=p(e.laneShort.trim()||`—`),r=p(e.tail.trim().toUpperCase()||`TBD`),i=p(e.phone?.trim()||`(858) 529-7860`),a=p(e.supportEmail?.trim()||`info@onflyair.com`),o=e.portalUrl.trim(),s=m(o),c=p(h(o)),l=p((e.headline??`Trip update`).trim()||`Trip update`),u=e.etaLine?.trim(),d=e.logoUrl?.trim();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OnFly trip update · PO #${t}</title>
</head>
<body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3">
    <tr>
      <td style="background:#0c0c0e;padding:16px 20px;border-bottom:3px solid #c9a227">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle">${d?`<img src="${m(d)}" alt="OnFly Air" width="168" style="display:block;max-width:168px;height:auto;border:0;background:transparent" />`:`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.14em"><span style="color:#c9a227">ONFLY</span> <span style="color:#f7f2e3">AIR</span></div>`}</td>
            <td align="right" style="vertical-align:middle;font-size:11px;color:#f7f2e3;letter-spacing:0.06em;text-transform:uppercase">
              24-hr ops <span style="color:#c9a227;font-weight:700;text-transform:none;letter-spacing:0">${i}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 12px">
        <table role="presentation" width="100%" style="max-width:640px">
          <tr>
            <td style="padding:22px 8px 8px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c9a227">${l}</div>
              <div style="margin-top:6px;font-size:24px;font-weight:700;color:#0c0c0e;letter-spacing:-0.02em">PO #${t}</div>
              <div style="margin-top:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;font-weight:700">${n}</div>
              <div style="margin-top:4px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#6b6560">Tail ${r}</div>
            </td>
          </tr>
          ${u?`<tr><td style="padding:8px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px">
              <tr><td style="padding:14px 16px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b6560">Revised timing</div>
                <div style="margin-top:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:700;color:#0c0c0e">${p(u)}</div>
              </td></tr>
            </table>
          </td></tr>`:``}
          <tr>
            <td style="padding:8px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px">
                <tr><td style="padding:18px 16px">
                  ${g(e.body)}
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 8px 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px">
                <tr>
                  <td style="padding:18px 16px;text-align:center">
                    <a href="${s}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:6px">Open live tracking</a>
                    <div style="margin-top:10px;font-size:11px;color:rgba(247,242,227,0.55)">${c}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 4px 0;font-size:12px;color:#6b6560;line-height:1.5">
                Questions? ${a} · ${i}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}function v(e){let t=[`OnFly trip update · PO #${e.poNumber.replace(/^PO\s*#?\s*/i,``).trim()||`—`}`,e.laneShort.trim()||`—`,`Tail ${(e.tail||`TBD`).toUpperCase()}`,``,(e.headline??`Trip update`).trim(),``];return e.etaLine?.trim()&&t.push(`Revised timing: ${e.etaLine.trim()}`,``),t.push(e.body.trim(),``,`Live tracking: ${e.portalUrl.trim()}`),t.join(`
`)}var y=e({buildEtaSheetPreviewHtml:()=>D,getEtaSheetThreadMeta:()=>C,portalTrackingUrlForTrip:()=>x,sendBookedEtaSheetToTrackers:()=>E,sendClientTrackingUpdate:()=>O});function b(e){return r(`/portal/track/${e}`)}function x(e,t=`desk@onflyair.com`){return b(d({tripId:e,email:t}))}function S(e){let t=new Set,n=[];for(let r of e){let e=r.trim().toLowerCase();!e||!e.includes(`@`)||t.has(e)||(t.add(e),n.push(e))}return n}function C(e){let t=[...e.events].filter(e=>e.kind===`eta_sheet_sent`||e.kind===`client_tracking_update_sent`).reverse();if(!t.length)return null;let n=``,r=[],i=[],a=[],o=[],s=new Set,c=new Set,l=new Set,u=new Set;for(let e of[...t].reverse()){let t=e.payload??{};!n&&typeof t.subject==`string`&&t.subject.trim()&&(n=t.subject.trim().replace(/^re:\s*/i,``).trim());for(let e of Array.isArray(t.recipients)?t.recipients:[]){let t=String(e).trim().toLowerCase();!t.includes(`@`)||l.has(t)||(l.add(t),r.push(t))}for(let e of Array.isArray(t.cc)?t.cc:[]){let t=String(e).trim().toLowerCase();!t.includes(`@`)||l.has(t)||u.has(t)||(u.add(t),i.push(t))}for(let e of Array.isArray(t.message_ids)?t.message_ids:[]){let t=String(e).trim();!t||s.has(t)||(s.add(t),a.push(t))}if(typeof t.message_id==`string`&&t.message_id.trim()){let e=t.message_id.trim();s.has(e)||(s.add(e),a.push(e))}for(let e of Array.isArray(t.email_ids)?t.email_ids:[]){let t=String(e).trim();!t||c.has(t)||(c.add(t),o.push(t))}if(typeof t.email_id==`string`&&t.email_id.trim()){let e=t.email_id.trim();c.has(e)||(c.add(e),o.push(e))}}return!r.length&&!n&&!a.length?null:{subject:n,recipients:r,cc:i,messageIds:a,emailIds:o}}function w(e){if(e.length)return{"In-Reply-To":e[e.length-1],References:e.join(` `)}}async function T(e){let t=S(e.recipients);if(!t.length)return[];let r=S(e.cc??[]).filter(e=>!t.includes(e)),s=i(),{sheet:u,trip:f}=e,p=[],m=[],h=``;for(let e of t){let t=l({trip:f,sheet:u,portalUrl:b(d({tripId:f.id,email:e}))}),n=o(t),i=a(t);h=c({poNumber:t.poNumber,laneShort:t.laneShort,tail:t.tail});let g=await s.send({to:e,cc:r.length?r:void 0,subject:h,html:n,text:i});p.push(g.id),g.messageId&&m.push(g.messageId)}return n(e.trip.id,e=>{e.events.push({at:new Date().toISOString(),actor:`system`,kind:`eta_sheet_sent`,payload:{recipients:t,cc:r,audience:`tracker_ops`,subject:h,email_ids:p,message_ids:m}})}),t}async function E(e){let t=u(e.trip,new Date,{clientFacing:!0});return t?{sentTo:await T({trip:e.trip,sheet:t,recipients:e.recipients,cc:e.cc})}:{sentTo:[]}}function D(e){let t=u(e,new Date,{clientFacing:!0});return t?o(l({trip:e,sheet:t,portalUrl:x(e.id)})):null}async function O(e){let r=t(e.tripId);if(!r)throw Error(`Trip not loaded in this session`);let a=e.body.trim();if(!a)throw Error(`Update message required`);let o=C(r),l=S(e.recipients?.length?e.recipients:o?.recipients??[]);if(!l.length)throw Error(`No ETA sheet recipients on this trip — send the ETA sheet first, or enter emails.`);let u=S([...e.cc??[],...o?.cc??[]]).filter(e=>!l.includes(e)),p=r.po_number?.trim()||r.quick?.po?.trim()||`T-${r.ref}`,m=s(r.lane),h=r.quick?.tail?.trim()||r.offers?.find(e=>e.state===`selected`)?.tail?.trim()||`TBD`,g=f({poNumber:p,laneShort:m,tail:h,priorSubject:o?.subject||c({poNumber:p,laneShort:m,tail:h})}),y=w(o?.messageIds??[]),x=i(),T=[],E=[];for(let t of l){let n=b(d({tripId:r.id,email:t})),i={poNumber:p,laneShort:m,tail:h,body:a,headline:e.headline?.trim()||`Trip update`,etaLine:e.etaLine?.trim()||null,portalUrl:n},o=await x.send({to:t,cc:u.length?u:void 0,subject:g,html:_(i),text:v(i),headers:y});T.push(o.id),o.messageId&&E.push(o.messageId)}return n(r.id,t=>{t.events.push({at:new Date().toISOString(),actor:`dispatcher`,kind:`client_tracking_update_sent`,payload:{recipients:l,cc:u,subject:g,headline:e.headline?.trim()||`Trip update`,eta_line:e.etaLine?.trim()||null,body:a,email_ids:T,message_ids:E,prior_message_ids:o?.messageIds??[]}})}),{sentTo:l,subject:g}}export{E as a,x as i,y as n,O as o,C as r,D as t};