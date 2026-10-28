function e(e){let t=e.pieces.reduce((e,t)=>e+(t.count||1),0),n=e.pieces.reduce((e,t)=>e+(t.weight_lbs||0)*(t.count||1),0),r=e.maxPayloadLbs??null,i=r==null?null:n<=r*.9;return{tripRef:e.tripRef,lane:e.lane,po:e.po?.trim()||`T-${e.tripRef}`,operatorName:e.operatorName||`TBD`,tail:e.tail||`TBD`,typeName:e.typeName||`TBD`,totalPieces:t,totalWeightLbs:n,payloadOk:i,maxPayloadLbs:r,pieces:e.pieces,originFbo:e.originFbo??null,destFbo:e.destFbo??null,etaSummary:e.etaSummary,emergencyPhone:e.emergencyPhone||`On-shift dispatch`,generatedAtIso:e.generatedAtIso??new Date().toISOString()}}function t(e){let t=e.pieces.length===0?`<tr><td colspan="6">No pieces on file</td></tr>`:e.pieces.map(e=>`<tr>
        <td>${e.count}</td>
        <td class="mono">${e.length_in}×${e.width_in}×${e.height_in}</td>
        <td class="mono">${e.weight_lbs}</td>
        <td>${e.stackable===!1?`No`:`Yes`}</td>
        <td>${e.hazmat_un||`—`}</td>
        <td class="mono">${(e.weight_lbs*(e.count||1)).toFixed(0)}</td>
      </tr>`).join(``),r=e.etaSummary.map(e=>`<li><span>${n(e.label)}</span> <span class="mono">${e.est_end?e.est_end.slice(0,16).replace(`T`,` `)+`Z`:`—`}</span></li>`).join(``),i=e.payloadOk==null?`Payload check: max payload unknown — confirm with operator`:e.payloadOk?`Payload OK — ${e.totalWeightLbs.toFixed(0)} lb / ${e.maxPayloadLbs} lb (90% rule)`:`PAYLOAD EXCEEDS 90% — ${e.totalWeightLbs.toFixed(0)} lb / ${e.maxPayloadLbs} lb`;return`<!DOCTYPE html>
<html lang="en" data-theme="client">
<head>
<meta charset="utf-8"/>
<title>Manifest T-${e.tripRef}</title>
<style>
  :root { --ink:#0C0C0E; --gold:#C9A227; --cream:#F7F2E3; --muted:#5c574c; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    background: var(--cream); color: var(--ink); }
  .sheet { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
  header { border-bottom: 3px solid var(--ink); padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .brand { font-size: 1.75rem; font-weight: 700; letter-spacing: 0.04em; }
  .brand span { color: var(--gold); }
  h1 { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0; }
  .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.5rem; font-size: 0.95rem; margin: 1rem 0; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.9em; }
  table { width:100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
  th, td { border-bottom: 1px solid #d4cfc0; padding: 0.45rem 0.35rem; text-align: left; }
  th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  .flag { margin: 1rem 0; padding: 0.75rem 1rem; border-left: 4px solid var(--gold); background: #fff; }
  .flag.bad { border-color: #C0392B; }
  ul.eta { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  ul.eta li { display:flex; justify-content: space-between; gap:1rem; padding: 0.25rem 0; border-bottom: 1px solid #e8e2d4; font-size: 0.9rem; }
  footer { margin-top: 2rem; font-size: 0.8rem; color: var(--muted); }
  @media print {
    body { background: white; }
    .sheet { max-width: none; padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div class="brand">On<span>Fly</span> Air</div>
      <h1>Load manifest · T-${e.tripRef}</h1>
    </header>
    <div class="meta">
      <div><strong>Lane</strong><br/>${n(e.lane)}</div>
      <div><strong>PO / ref</strong><br/><span class="mono">${n(e.po)}</span></div>
      <div><strong>Aircraft</strong><br/><span class="mono">${n(e.tail)}</span> · ${n(e.typeName)}</div>
      <div><strong>Operator</strong><br/>${n(e.operatorName)}</div>
    </div>
    <div class="flag ${e.payloadOk===!1?`bad`:``}">${n(i)}</div>
    <h2 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted)">Pieces · ${e.totalPieces} / ${e.totalWeightLbs.toFixed(0)} lb</h2>
    <table>
      <thead><tr><th>Qty</th><th>L×W×H (in)</th><th>Wt ea</th><th>Stack</th><th>Hazmat</th><th>Total lb</th></tr></thead>
      <tbody>${t}</tbody>
    </table>
    <div class="meta">
      <div>
        <strong>Origin FBO</strong><br/>
        ${n(e.originFbo?.name||`TBD`)}<br/>
        <span class="mono">${n(e.originFbo?.phone||``)}</span>
        ${e.originFbo?.afterHours?`<br/>AH <span class="mono">${n(e.originFbo.afterHours)}</span>`:``}
      </div>
      <div>
        <strong>Dest FBO</strong><br/>
        ${n(e.destFbo?.name||`TBD`)}<br/>
        <span class="mono">${n(e.destFbo?.phone||``)}</span>
        ${e.destFbo?.afterHours?`<br/>AH <span class="mono">${n(e.destFbo.afterHours)}</span>`:``}
      </div>
    </div>
    <h2 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted)">ETA summary</h2>
    <ul class="eta">${r||`<li>No ETA chain on file</li>`}</ul>
    <footer>
      24/7 dispatch: ${n(e.emergencyPhone)} · Generated ${n(e.generatedAtIso)} UTC · Internal / crew
    </footer>
  </div>
</body>
</html>`}function n(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}export{t as n,e as t};