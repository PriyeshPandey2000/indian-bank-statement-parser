/**
 * test-no-llm-parse.mjs
 * Parses Chandra/Datalab JSON → CSV using headers directly from <th> cells.
 * No LLM, no regex column mapping. Headers passed through as-is.
 *
 * Usage:
 *   node test-no-llm-parse.mjs <chandra-json-path> [llm-transactions-json-for-comparison]
 *
 * Example:
 *   node test-no-llm-parse.mjs storage/abc123/chandra_raw.json storage/abc123/original_llm_transactions.json
 */

import fs from 'fs';

const DATE_RE  = /\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/;
const AMOUNT_RE = /^[\d,]+(\.\d+)?$/;

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTable(html) {
  const headers = [];
  const dataRows = [];

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRe.exec(html)) !== null) {
    const inner = trM[1];
    const ths = [], tds = [];

    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let m;
    while ((m = thRe.exec(inner)) !== null) ths.push(stripHtml(m[1]));

    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((m = tdRe.exec(inner)) !== null) tds.push(stripHtml(m[1]));

    if (ths.length) {
      // keep last header row found (some tables repeat headers per page)
      if (ths.some(h => h.length > 0)) {
        headers.length = 0;
        headers.push(...ths);
      }
    } else if (tds.length) {
      dataRows.push(tds);
    }
  }

  return { headers, dataRows };
}

// Infer which column index is the date column from data rows when headers unclear
function inferDateCol(dataRows) {
  const scores = {};
  for (const row of dataRows.slice(0, 15)) {
    row.forEach((cell, i) => {
      if (DATE_RE.test(cell.trim())) scores[i] = (scores[i] || 0) + 1;
    });
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? parseInt(best[0]) : -1;
}

function isTransactionRow(cells, dateCol) {
  if (dateCol < 0 || dateCol >= cells.length) return false;
  const dateVal = cells[dateCol]?.trim() || '';
  if (!DATE_RE.test(dateVal)) return false;
  // must have at least one numeric-looking cell (amount)
  return cells.some((c, i) => i !== dateCol && AMOUNT_RE.test(c.replace(/,/g, '').trim()) && c.trim().length > 0);
}

function extractFromJson(chandraJson) {
  let headers = null;
  let dateCol = -1;
  const rows = [];

  const pages = chandraJson.children || [];
  for (const page of pages) {
    const pageNum = (page.page ?? 0) + 1;
    for (const block of (page.children || [])) {
      if (block.block_type !== 'Table') continue;

      const { headers: tblHeaders, dataRows } = parseTable(block.html);

      // Set headers from first table that has them
      if (!headers && tblHeaders.length > 0) {
        headers = tblHeaders;
        console.error('Headers from Datalab:', headers);

        // Try to find date col from headers first
        dateCol = headers.findIndex(h =>
          /\b(txn\s*date|trans\s*date|value\s*date|posting\s*date|\bdate\b|dt)\b/i.test(h)
        );

        if (dateCol < 0) {
          // Fall back to content inference
          dateCol = inferDateCol(dataRows);
          console.error('Header match failed — inferred date col from content:', dateCol);
        } else {
          console.error('Date col from header match:', dateCol, `("${headers[dateCol]}")`);
        }
      }

      for (const cells of dataRows) {
        if (!isTransactionRow(cells, dateCol)) continue;
        rows.push({ cells, page: pageNum });
      }
    }
  }

  return { headers, dateCol, rows };
}

function toCsv(headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const lines = [];
  if (headers) lines.push([...headers, 'page'].map(escape).join(','));
  for (const { cells, page } of rows) {
    // pad/truncate to header length
    const padded = headers
      ? Array.from({ length: headers.length }, (_, i) => cells[i] ?? '')
      : cells;
    lines.push([...padded, page].map(escape).join(','));
  }
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const jsonPath = process.argv[2];
const comparePath = process.argv[3];

if (!jsonPath) {
  console.error('Usage: node test-no-llm-parse.mjs <chandra-json> [llm-transactions-json]');
  process.exit(1);
}
if (!fs.existsSync(jsonPath)) {
  console.error('File not found:', jsonPath);
  process.exit(1);
}

let raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
// Unwrap envelope shapes: { json: {...} } or { result: {...} } or { output: {...} }
if (raw.json) raw = raw.json;
else if (raw.result) raw = raw.result;
else if (raw.output) raw = raw.output;
else if (raw.data) raw = raw.data;

const { headers, dateCol, rows } = extractFromJson(raw);

console.error('\n── Results ──────────────────────────────────────────────');
console.error('Headers:', headers);
console.error('Date column index:', dateCol);
console.error('Transaction rows found:', rows.length);

// Save CSV
const csvPath = jsonPath.replace(/\.json$/i, '_no_llm.csv');
fs.writeFileSync(csvPath, toCsv(headers, rows));
console.error('CSV saved:', csvPath);

// Save JSON
const outPath = jsonPath.replace(/\.json$/i, '_no_llm_transactions.json');
const outJson = rows.map(({ cells, page }) => {
  const obj = { page };
  if (headers) headers.forEach((h, i) => { obj[h] = cells[i] ?? null; });
  else cells.forEach((c, i) => { obj[`col${i}`] = c; });
  return obj;
});
fs.writeFileSync(outPath, JSON.stringify(outJson, null, 2));
console.error('JSON saved:', outPath);

// Compare with LLM output if provided
if (comparePath && fs.existsSync(comparePath)) {
  const llmTxns = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
  console.error('\n── Comparison with LLM output ───────────────────────────');
  console.error('LLM transaction count:   ', llmTxns.length);
  console.error('No-LLM transaction count:', rows.length);
  const diff = rows.length - llmTxns.length;
  console.error('Difference:              ', diff > 0 ? `+${diff}` : diff);
}
