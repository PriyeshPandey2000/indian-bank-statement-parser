/**
 * test-chandra-pipeline.mjs
 * Verifies the EXACT REST flow used by chandraService.ts + chandraParseService.ts
 * Usage: node test-chandra-pipeline.mjs <pdf-path>
 * Env: DATALAB_API_KEY, DATALAB_PIPELINE_ID (loaded from backend/.env)
 */

import fs from 'fs';
import path from 'path';

// Load .env
const envPath = path.join(path.dirname(new URL(import.meta.url).pathname), '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
});

const API_KEY     = process.env.DATALAB_API_KEY;
const PIPELINE_ID = process.env.DATALAB_PIPELINE_ID;
const BASE        = 'https://www.datalab.to/api/v1';

if (!API_KEY || !PIPELINE_ID) { console.error('Missing DATALAB_API_KEY or DATALAB_PIPELINE_ID'); process.exit(1); }

const pdfPath = process.argv[2];
if (!pdfPath || !fs.existsSync(pdfPath)) { console.error('Bad pdf path:', pdfPath); process.exit(1); }

const buf  = fs.readFileSync(pdfPath);
const name = path.basename(pdfPath);

// --- Submit ---
const form = new FormData();
form.append('file', new Blob([buf], { type: 'application/pdf' }), name);
form.append('output_format', 'json');
console.log(`[submit] POST ${BASE}/pipelines/${PIPELINE_ID}/run  file=${name} size=${buf.length}`);

const runResp = await fetch(`${BASE}/pipelines/${PIPELINE_ID}/run`, {
  method: 'POST', headers: { 'X-API-Key': API_KEY }, body: form,
});
console.log(`[submit] status=${runResp.status}`);
if (!runResp.ok) { console.error(await runResp.text()); process.exit(1); }

const runJson = await runResp.json();
console.log('[submit] body:', JSON.stringify(runJson, null, 2));

const execId = runJson.execution_id || runJson.id || runJson.executionId;
if (!execId) { console.error('No execution_id in response — code expects `execution_id` field'); process.exit(1); }
console.log(`[submit] execution_id=${execId}`);

// --- Poll ---
let final;
for (let i = 0; i < 150; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const s = await fetch(`${BASE}/pipelines/executions/${execId}`, { headers: { 'X-API-Key': API_KEY } });
  if (!s.ok) { process.stdout.write(`x${s.status} `); continue; }
  const j = await s.json();
  process.stdout.write(`${j.status} `);
  if (j.status === 'completed' || j.status === 'complete' || j.status === 'success') { final = j; break; }
  if (j.status === 'failed' || j.status === 'error')   { console.error('\n[poll] failed:', JSON.stringify(j)); process.exit(1); }
}
console.log('\n[poll] final status keys:', Object.keys(final || {}));

// --- Result ---
const resResp = await fetch(`${BASE}/pipelines/executions/${execId}/steps/0/result`, {
  headers: { 'X-API-Key': API_KEY },
});
console.log(`[result] status=${resResp.status}`);
if (!resResp.ok) { console.error(await resResp.text()); process.exit(1); }

const result = await resResp.json();
const outPath = pdfPath.replace(/\.pdf$/i, '_chandra_pipeline.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`[result] saved -> ${outPath}`);
console.log('[result] top-level keys:', Object.keys(result));

// --- Parse using identical logic to chandraParseService.ts ---
const DATE_RE = /\d{2}[\/.\-]\d{2}[\/.\-]\d{2,4}/;
const stripHtml = h => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function parseRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const inner = m[1];
    const ths = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => stripHtml(x[1]));
    const tds = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => stripHtml(x[1]));
    if (ths.length) rows.push({ type: 'header', cells: ths });
    else if (tds.length) rows.push({ type: 'data', cells: tds });
  }
  return rows;
}
function mapCols(h) {
  const idx = re => h.findIndex(x => re.test(x));
  return { date: idx(/\bdate\b/i), desc: idx(/narration|description|particulars|remarks/i),
           debit: idx(/withdrawal|debit|\bdr\b/i), credit: idx(/deposit|credit|\bcr\b/i), balance: idx(/balance/i) };
}

// Try to find the chandra json — might be wrapped
let chandraJson = result;
if (result.result) chandraJson = result.result;
else if (result.output) chandraJson = result.output;
else if (result.data) chandraJson = result.data;

console.log('[parse] using shape with keys:', Object.keys(chandraJson).slice(0, 10));

if (!chandraJson.children) {
  console.error('[parse] NO `children` array — chandraParseService expects json.children[]');
  console.error('[parse] Sample:', JSON.stringify(chandraJson).slice(0, 500));
  process.exit(1);
}

let colMap = null;
const txns = [];
for (const page of chandraJson.children) {
  const pageNum = (page.page ?? 0) + 1;
  for (const block of (page.children ?? [])) {
    if (block.block_type !== 'Table') continue;
    const rows = parseRows(block.html);
    if (!colMap) {
      const hdr = rows.find(r => r.type === 'header');
      if (hdr) { colMap = mapCols(hdr.cells); console.log('[parse] headers:', hdr.cells); console.log('[parse] colMap:', colMap); }
    }
    if (!colMap) continue;
    for (const row of rows) {
      if (row.type !== 'data') continue;
      const date = colMap.date >= 0 ? row.cells[colMap.date] : null;
      if (!date || !DATE_RE.test(date)) continue;
      txns.push({
        date,
        description: colMap.desc    >= 0 ? row.cells[colMap.desc]    : null,
        debit:       colMap.debit   >= 0 ? row.cells[colMap.debit]   : null,
        credit:      colMap.credit  >= 0 ? row.cells[colMap.credit]  : null,
        balance:     colMap.balance >= 0 ? row.cells[colMap.balance] : null,
        page:        pageNum,
      });
    }
  }
}

console.log(`\n[parse] extracted ${txns.length} transactions`);
txns.slice(0, 5).forEach((t,i) => console.log(`  ${i+1}.`, JSON.stringify(t)));
if (txns.length > 5) console.log(`  ... ${txns.length - 5} more`);

console.log('\n=== VERDICT ===');
console.log(`Pipeline submit:     OK`);
console.log(`Execution polling:   OK (status field works)`);
console.log(`Result fetch:        OK`);
console.log(`Response shape:      ${chandraJson.children ? 'OK (json.children[])' : 'MISMATCH'}`);
console.log(`Parse logic:         ${txns.length > 0 ? 'OK' : 'NO TRANSACTIONS FOUND'}`);
