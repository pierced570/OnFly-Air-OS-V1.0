/**
 * Crew / handler load manifest — HTML for print-CSS and future render-doc.
 * Pure TypeScript.
 */

export type ManifestPiece = {
  count: number
  length_in: number
  width_in: number
  height_in: number
  weight_lbs: number
  stackable?: boolean
  hazmat_un?: string | null
}

export type ManifestInput = {
  tripRef: number
  lane: string
  po?: string | null
  operatorName: string
  tail: string
  typeName: string
  maxPayloadLbs?: number | null
  originFbo?: { name: string; phone?: string; afterHours?: string } | null
  destFbo?: { name: string; phone?: string; afterHours?: string } | null
  pieces: ManifestPiece[]
  etaSummary: Array<{ label: string; est_end: string | null }>
  emergencyPhone?: string
  generatedAtIso?: string
}

export type ManifestModel = {
  tripRef: number
  lane: string
  po: string
  operatorName: string
  tail: string
  typeName: string
  totalPieces: number
  totalWeightLbs: number
  payloadOk: boolean | null
  maxPayloadLbs: number | null
  pieces: ManifestPiece[]
  originFbo: ManifestInput['originFbo']
  destFbo: ManifestInput['destFbo']
  etaSummary: ManifestInput['etaSummary']
  emergencyPhone: string
  generatedAtIso: string
}

export function buildManifestModel(input: ManifestInput): ManifestModel {
  const totalPieces = input.pieces.reduce((n, p) => n + (p.count || 1), 0)
  const totalWeightLbs = input.pieces.reduce(
    (n, p) => n + (p.weight_lbs || 0) * (p.count || 1),
    0,
  )
  const max = input.maxPayloadLbs ?? null
  const payloadOk = max == null ? null : totalWeightLbs <= max * 0.9
  return {
    tripRef: input.tripRef,
    lane: input.lane,
    po: input.po?.trim() || `T-${input.tripRef}`,
    operatorName: input.operatorName || 'TBD',
    tail: input.tail || 'TBD',
    typeName: input.typeName || 'TBD',
    totalPieces,
    totalWeightLbs,
    payloadOk,
    maxPayloadLbs: max,
    pieces: input.pieces,
    originFbo: input.originFbo ?? null,
    destFbo: input.destFbo ?? null,
    etaSummary: input.etaSummary,
    emergencyPhone: input.emergencyPhone || 'On-shift dispatch',
    generatedAtIso: input.generatedAtIso ?? new Date().toISOString(),
  }
}

/** Cream client-doc family HTML — print via browser / future render-doc. */
export function renderManifestHtml(model: ManifestModel): string {
  const pieceRows =
    model.pieces.length === 0
      ? `<tr><td colspan="6">No pieces on file</td></tr>`
      : model.pieces
          .map(
            (p) => `<tr>
        <td>${p.count}</td>
        <td class="mono">${p.length_in}×${p.width_in}×${p.height_in}</td>
        <td class="mono">${p.weight_lbs}</td>
        <td>${p.stackable === false ? 'No' : 'Yes'}</td>
        <td>${p.hazmat_un || '—'}</td>
        <td class="mono">${(p.weight_lbs * (p.count || 1)).toFixed(0)}</td>
      </tr>`,
          )
          .join('')

  const etaRows = model.etaSummary
    .map(
      (e) =>
        `<li><span>${escapeHtml(e.label)}</span> <span class="mono">${e.est_end ? e.est_end.slice(0, 16).replace('T', ' ') + 'Z' : '—'}</span></li>`,
    )
    .join('')

  const payloadLine =
    model.payloadOk == null
      ? 'Payload check: max payload unknown — confirm with operator'
      : model.payloadOk
        ? `Payload OK — ${model.totalWeightLbs.toFixed(0)} lb / ${model.maxPayloadLbs} lb (90% rule)`
        : `PAYLOAD EXCEEDS 90% — ${model.totalWeightLbs.toFixed(0)} lb / ${model.maxPayloadLbs} lb`

  return `<!DOCTYPE html>
<html lang="en" data-theme="client">
<head>
<meta charset="utf-8"/>
<title>Manifest T-${model.tripRef}</title>
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
      <h1>Load manifest · T-${model.tripRef}</h1>
    </header>
    <div class="meta">
      <div><strong>Lane</strong><br/>${escapeHtml(model.lane)}</div>
      <div><strong>PO / ref</strong><br/><span class="mono">${escapeHtml(model.po)}</span></div>
      <div><strong>Aircraft</strong><br/><span class="mono">${escapeHtml(model.tail)}</span> · ${escapeHtml(model.typeName)}</div>
      <div><strong>Operator</strong><br/>${escapeHtml(model.operatorName)}</div>
    </div>
    <div class="flag ${model.payloadOk === false ? 'bad' : ''}">${escapeHtml(payloadLine)}</div>
    <h2 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted)">Pieces · ${model.totalPieces} / ${model.totalWeightLbs.toFixed(0)} lb</h2>
    <table>
      <thead><tr><th>Qty</th><th>L×W×H (in)</th><th>Wt ea</th><th>Stack</th><th>Hazmat</th><th>Total lb</th></tr></thead>
      <tbody>${pieceRows}</tbody>
    </table>
    <div class="meta">
      <div>
        <strong>Origin FBO</strong><br/>
        ${escapeHtml(model.originFbo?.name || 'TBD')}<br/>
        <span class="mono">${escapeHtml(model.originFbo?.phone || '')}</span>
        ${model.originFbo?.afterHours ? `<br/>AH <span class="mono">${escapeHtml(model.originFbo.afterHours)}</span>` : ''}
      </div>
      <div>
        <strong>Dest FBO</strong><br/>
        ${escapeHtml(model.destFbo?.name || 'TBD')}<br/>
        <span class="mono">${escapeHtml(model.destFbo?.phone || '')}</span>
        ${model.destFbo?.afterHours ? `<br/>AH <span class="mono">${escapeHtml(model.destFbo.afterHours)}</span>` : ''}
      </div>
    </div>
    <h2 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted)">ETA summary</h2>
    <ul class="eta">${etaRows || '<li>No ETA chain on file</li>'}</ul>
    <footer>
      24/7 dispatch: ${escapeHtml(model.emergencyPhone)} · Generated ${escapeHtml(model.generatedAtIso)} UTC · Internal / crew
    </footer>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
