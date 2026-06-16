/**
 * test-llm-extract.mjs
 * Usage: GROQ_API_KEY=<key> node test-llm-extract.mjs <path-to-pdf>
 */

import { LiteParse } from '@llamaindex/liteparse';
import fs from 'fs';
import path from 'path';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SOURCE_DATE_RE = [
  /\b\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}\b/,   // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  /\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b/,
  /\b\d{2}-[A-Za-z]{3}-\d{4}\b/,
  /\b\d{1,2}\s+[A-Za-z]{3}\b/,
];

function looksLikeDate(text) {
  return SOURCE_DATE_RE.some(r => r.test(text));
}

/**
 * Detect the x-boundaries of debit/credit/balance columns from the header row items.
 * Returns null if column headers can't be found (e.g. continuation pages with no header).
 * On pages without headers, we carry over the previous page's column info.
 */
function detectAmountColumns(textItems) {
  const pageHeight = Math.max(...textItems.map(i => i.y + (i.height ?? 10)));
  const headerCutoff = pageHeight * 0.3;
  // Only look in the top 30% of the page where column headers live
  const headerZone = textItems.filter(i => i.y < headerCutoff);

  const cx = item => item.x + (item.width ?? 0) / 2;

  const debitHeader  = headerZone.find(i => /\b(withdrawal|debit)\b/i.test(i.text));
  const creditHeader = headerZone.find(i => /\b(deposit|credit)\b/i.test(i.text));
  const balanceHeader = headerZone.find(i => /\bbalance\b/i.test(i.text));

  if (!debitHeader || !creditHeader || !balanceHeader) return null;

  const dX = cx(debitHeader);
  const cX = cx(creditHeader);
  const bX = cx(balanceHeader);

  // Use bottom of the actual header column row items, not a page-% heuristic —
  // a fixed percentage can clip the first data row when transactions start near the top.
  const headerRowBottom = Math.max(
    ...[debitHeader, creditHeader, balanceHeader].map(i => i.y + (i.height ?? 10))
  );

  return {
    debitCreditBound:   (dX + cX) / 2,
    creditBalanceBound: (cX + bX) / 2,
    amountZoneStart: debitHeader.x - 30,
    minAnnotationY: headerRowBottom + 5,
  };
}

function annotateItemText(item, cols) {
  if (!cols || item.x < cols.amountZoneStart) return (item.text ?? '').trim();
  // Skip annotation in the header/address zone — false positives from right-aligned header text
  if (item.y < cols.minAnnotationY) return (item.text ?? '').trim();
  const text = (item.text ?? '').trim();
  if (!text) return '';
  if (item.x < cols.debitCreditBound)   return `[WITHDRAWAL:${text}]`;
  if (item.x < cols.creditBalanceBound) return `[DEPOSIT:${text}]`;
  return `[BALANCE:${text}]`;
}

function reconstructPageLines(textItems, tolerancePx = 4, cols = null) {
  if (!textItems.length) return [];
  const sorted = [...textItems].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  const yCenter = item => item.y + (item.height ?? 10) / 2;
  const buckets = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(yCenter(item) - yCenter(current[0])) <= tolerancePx) {
      current.push(item);
    } else {
      buckets.push(current);
      current = [item];
    }
  }
  buckets.push(current);
  return buckets
    .map(b => b.sort((a, b) => a.x - b.x).map(i => annotateItemText(i, cols)).filter(Boolean).join(' '))
    .filter(line => line.trim().length > 0);
}


// FIX 1: process page by page to avoid cross-page blur
async function callGroqPage(pageText, pageNum) {
  const prompt = `You are a bank statement parser. Extract ALL transactions from this single page of a bank statement.
Return ONLY a valid JSON array, no explanation, no markdown fences.

Schema: [{"date":"...","description":"...","debit":"...","credit":"...","balance":"..."}]

Rules:
- Extract every transaction row. Do not skip any.
- date: the transaction date exactly as written (e.g. "03 AUG 2025", "02/12/2024")
- description: full narration text for this transaction (exclude any [WITHDRAWAL:], [DEPOSIT:], [BALANCE:] tags)
- debit: withdrawal amount as string, null if not present
- credit: deposit amount as string, null if not present
- balance: running balance after this transaction, null if not visible
- If you are unsure about any field value, set it to null — do NOT guess
- Amount column tags (when present): [WITHDRAWAL:X] means X was debited → debit field; [DEPOSIT:X] means X was credited → credit field; [BALANCE:X] is the running balance → balance field
- SKIP these rows entirely (do not include in output):
    * Column header rows (containing words like "Date", "Narration", "Debit", "Credit", "Balance", "Ref No", "Cheque No" as headings)
    * Opening balance / Closing balance rows
    * Page totals or summary rows
    * Any row that is not a transaction

Page ${pageNum}:
${pageText}`;

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq API error ${resp.status} on page ${pageNum}: ${err}`);
  }

  const data = await resp.json();
  const content = data.choices[0].message.content.trim();
  const cleaned = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`[PAGE ${pageNum} RAW OUTPUT]\n`, content);
    return [];
  }
}

// FIX 2: validate and clean each transaction
const HEADER_DESC_RE = /^(date\s|narration\s*$|description\s*$|particulars\s*$|ref\.?\s*no|cheque\s*no|tran\.?\s*(date|id|no)|txn\.?\s*(date|id|no)|value\s*dt|sl\.?\s*no\.?)/i;
const DAYS_IN_MONTH = { JAN:31,FEB:29,MAR:31,APR:30,MAY:31,JUN:30,JUL:31,AUG:31,SEP:30,OCT:31,NOV:30,DEC:31 };

function isValidDate(dateStr) {
  if (!dateStr) return false;
  // DD MMM YYYY
  const m1 = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m1) {
    const day = parseInt(m1[1]);
    const mon = m1[2].toUpperCase();
    const maxDay = DAYS_IN_MONTH[mon];
    if (!maxDay || day < 1 || day > maxDay) return false;
    return true;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const m2 = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/);
  if (m2) {
    const day = parseInt(m2[1]), mon = parseInt(m2[2]);
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return false;
    return true;
  }
  return true; // unknown format — keep, don't drop
}

function postProcess(transactions) {
  return transactions
    .filter(tx => {
      // FIX 2a: drop header-like descriptions
      if (HEADER_DESC_RE.test((tx.description || '').trim())) return false;
      // FIX 2b: must have a date
      if (!tx.date || tx.date.trim() === '') return false;
      // FIX 2d: must have at least one amount field
      if (!tx.debit && !tx.credit && !tx.balance) return false;
      return true;
    })
    .map(tx => ({
      date: tx.date?.trim() || null,
      description: tx.description?.trim() || null,
      debit: tx.debit ?? null,
      credit: tx.credit ?? null,
      balance: tx.balance ?? null,
    }));
}

function verify(transactions, pageTexts) {
  const allLines = pageTexts.flat();
  const allText = allLines.join('\n');
  const sourceDateLines = allLines.filter(line => looksLikeDate(line));

  console.log('\n══════════════════════════════════════════');
  console.log(`  EXTRACTED: ${transactions.length} transactions`);
  console.log(`  SOURCE DATE LINES: ~${sourceDateLines.length} (rough upper bound)`);
  console.log('══════════════════════════════════════════\n');

  let hallucinations = 0, verified = 0;
  console.log('DATE                DESCRIPTION (truncated)                DEBIT        CREDIT       BALANCE      VERIFIED');
  console.log('─'.repeat(110));

  for (const tx of transactions) {
    const dateFound = allText.includes(tx.date) || SOURCE_DATE_RE.some(r => r.test(tx.date));
    const checkAmt = tx.debit || tx.credit || '';
    const amountFound = checkAmt ? allText.includes(checkAmt) : true;
    const ok = dateFound && amountFound;
    if (ok) verified++; else hallucinations++;

    const flag = ok ? '✓' : '✗ SUSPECT';
    console.log(
      `${(tx.date||'').padEnd(18)} ${(tx.description||'').slice(0,38).padEnd(38)} ${(tx.debit||'-').padEnd(12)} ${(tx.credit||'-').padEnd(12)} ${(tx.balance||'-').padEnd(12)} ${flag}`
    );
  }

  console.log('─'.repeat(110));
  console.log(`\n✓ Verified: ${verified}  ✗ Suspect: ${hallucinations}`);

  const potentialMisses = sourceDateLines.filter(line =>
    !transactions.some(tx => tx.date && line.includes(tx.date.trim()))
  );

  if (potentialMisses.length > 0) {
    console.log(`\n⚠  POTENTIAL MISSES (${potentialMisses.length} source date lines not matched to any transaction):`);
    potentialMisses.slice(0, 15).forEach(l => console.log('  >', l));
    if (potentialMisses.length > 15) console.log(`  ... and ${potentialMisses.length - 15} more`);
  } else {
    console.log('\n✓ No obvious misses in source text');
  }
}

async function main() {
  if (!GROQ_API_KEY) { console.error('Error: GROQ_API_KEY not set'); process.exit(1); }

  const pdfPath = process.argv[2];
  const password = process.argv[3];
  if (!pdfPath) { console.error('Usage: GROQ_API_KEY=<key> node test-llm-extract.mjs <path-to-pdf> [password]'); process.exit(1); }

  const resolvedPath = path.resolve(pdfPath);
  if (!fs.existsSync(resolvedPath)) { console.error(`File not found: ${resolvedPath}`); process.exit(1); }

  console.log(`Parsing: ${resolvedPath}`);
  const parser = new LiteParse({ outputFormat: 'json', ocrEnabled: true, dpi: 400, ...(password && { password }) });
  const result = await parser.parse(resolvedPath, true);
  if (!result.json) throw new Error('LiteParse returned no JSON');

  // Detect column layout per page; carry over to pages missing a header
  let lastCols = null;
  const pageTexts = result.json.pages.map(p => {
    const cols = detectAmountColumns(p.textItems) ?? lastCols;
    if (cols) lastCols = cols;
    return reconstructPageLines(p.textItems, 4, cols);
  });
  console.log(`Parsed ${pageTexts.length} pages. Calling Groq page by page...`);

  // FIX 1: page-by-page calls
  const allTransactions = [];
  for (let i = 0; i < pageTexts.length; i++) {
    process.stdout.write(`  Page ${i + 1}/${pageTexts.length}... `);
    const pageTxns = await callGroqPage(pageTexts[i].join('\n'), i + 1);
    console.log(`${pageTxns.length} transactions`);
    allTransactions.push(...pageTxns);
  }

  const cleaned = postProcess(allTransactions);
  console.log(`\nRaw extracted: ${allTransactions.length} → after validation: ${cleaned.length}`);

  verify(cleaned, pageTexts);

  const outPath = resolvedPath.replace(/\.pdf$/i, '_llm_transactions.json');
  fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2));
  console.log(`\nSaved to: ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
