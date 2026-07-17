import fs from 'fs';
import path from 'path';
import { getDocumentDir } from '../utils/storage';
import { getParsedJson, readPdfType } from './parseService';
import { runChandraOcr } from './chandraService';
import { parseChandraJson } from './chandraParseService';
import { parseDirectJson, buildDirectDocumentTransactions } from './directParseService';
import type { DocumentTransactions } from './transactionService';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

interface TextItem {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface AmountColumns {
  debitCreditBound: number;
  creditBalanceBound: number;
  amountZoneStart: number;
}

interface RawTx {
  date: string | null;
  description: string | null;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  page: number;
}

function detectAmountColumns(textItems: TextItem[]): AmountColumns | null {
  const pageHeight = Math.max(...textItems.map(i => i.y + (i.height ?? 10)));
  const headerZone = textItems.filter(i => i.y < pageHeight * 0.3);
  const cx = (i: TextItem) => i.x + (i.width ?? 0) / 2;

  const debitH  = headerZone.find(i => /\b(withdrawal|debit)\b/i.test(i.text));
  const creditH = headerZone.find(i => /\b(deposit|credit)\b/i.test(i.text));
  const balH    = headerZone.find(i => /\bbalance\b/i.test(i.text));

  if (!debitH || !creditH || !balH) return null;

  return {
    debitCreditBound:   (cx(debitH) + cx(creditH)) / 2,
    creditBalanceBound: (cx(creditH) + cx(balH)) / 2,
    amountZoneStart:    debitH.x - 30,
  };
}

function annotateItem(item: TextItem, cols: AmountColumns | null): string {
  const text = (item.text ?? '').trim();
  if (!text || !cols || item.x < cols.amountZoneStart) return text;
  if (item.x < cols.debitCreditBound)   return `[WITHDRAWAL:${text}]`;
  if (item.x < cols.creditBalanceBound) return `[DEPOSIT:${text}]`;
  return `[BALANCE:${text}]`;
}

function reconstructLines(textItems: TextItem[], cols: AmountColumns | null, tolerancePx = 4): string[] {
  if (!textItems.length) return [];
  const sorted = [...textItems].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  const yc = (i: TextItem) => i.y + (i.height ?? 10) / 2;
  const buckets: TextItem[][] = [];
  let cur: TextItem[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    if (Math.abs(yc(item) - yc(cur[0]!)) <= tolerancePx) cur.push(item);
    else { buckets.push(cur); cur = [item]; }
  }
  buckets.push(cur);
  return buckets
    .map(b => b.sort((a, b) => a.x - b.x).map(i => annotateItem(i, cols)).filter(Boolean).join(' '))
    .filter(l => l.trim().length > 0);
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function callGroqWithRetry(pageText: string, pageNum: number, apiKey: string, attempt = 1): Promise<Omit<RawTx, 'page'>[]> {
  const prompt = `You are a bank statement parser. Extract ALL transactions from this single page of a bank statement.
Return ONLY a valid JSON array, no explanation, no markdown fences.

Schema: [{"date":"...","description":"...","debit":"...","credit":"...","balance":"..."}]

Rules:
- Extract every transaction row. Do not skip any.
- date: the transaction date exactly as written (e.g. "03 AUG 2025", "02/12/2024")
- description: full narration text for this transaction
- debit: withdrawal amount as string, null if not present
- credit: deposit amount as string, null if not present
- balance: running balance after this transaction, null if not visible
- If unsure about any field, set it to null — do NOT guess
- Amount tags when present: [WITHDRAWAL:X] → debit field; [DEPOSIT:X] → credit field; [BALANCE:X] → balance field
- SKIP entirely: column header rows, opening/closing balance rows, page totals, non-transaction rows

Page ${pageNum}:
${pageText}`;

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 32768 }),
  });

  if (resp.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = resp.headers.get('retry-after');
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS * attempt;
    console.warn(`[Groq] 429 rate limited page ${pageNum}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, delay));
    return callGroqWithRetry(pageText, pageNum, apiKey, attempt + 1);
  }

  if (!resp.ok) throw new Error(`Groq API error ${resp.status} page ${pageNum}: ${await resp.text()}`);

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]!.message.content.trim();
  const cleaned = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`[Groq] page ${pageNum} returned non-array: ${content.slice(0, 200)}`);
  }
  return parsed as Omit<RawTx, 'page'>[];
}

function getDatalabCredentials(): { key: string; pipelineId: string } {
  const key        = process.env['DATALAB_API_KEY'];
  const pipelineId = process.env['DATALAB_PIPELINE_ID'];
  if (!key)        throw new Error('DATALAB_API_KEY not configured');
  if (!pipelineId) throw new Error('DATALAB_PIPELINE_ID not configured');
  return { key, pipelineId };
}

const HEADER_RE = /^(date\s|narration\s*$|description\s*$|particulars\s*$|ref\.?\s*no|cheque\s*no|tran\.?\s*(date|id|no)|txn\.?\s*(date|id|no)|value\s*dt|sl\.?\s*no\.?)/i;

function postProcess(txns: RawTx[]): RawTx[] {
  return txns
    .filter(tx => {
      if (HEADER_RE.test((tx.description ?? '').trim())) return false;
      if (!tx.date?.trim()) return false;
      if (!tx.debit && !tx.credit && !tx.balance) return false;
      return true;
    })
    .map(tx => ({
      date:        tx.date?.trim()        ?? null,
      description: tx.description?.trim() ?? null,
      debit:       tx.debit               ?? null,
      credit:      tx.credit              ?? null,
      balance:     tx.balance             ?? null,
      page:        tx.page,
    }));
}


function balanceCheck(txns: RawTx[]): { isSuspicious: boolean; suspiciousReason?: string }[] {
  return txns.map((tx, i) => {
    if (i === 0) return { isSuspicious: false };
    const prevBal = parseFloat(txns[i - 1]!.balance ?? 'NaN');
    const curBal  = parseFloat(tx.balance  ?? 'NaN');
    let debit   = parseFloat(tx.debit    ?? '0') || 0;
    let credit  = parseFloat(tx.credit   ?? '0') || 0;
    if (isNaN(prevBal) || isNaN(curBal)) return { isSuspicious: false };

    // Handle banks (e.g. HDFC) that put deposits as 0.00 withdrawal with no credit column
    if (debit === 0 && credit === 0 && tx.debit && tx.debit !== '0.00' && tx.debit !== '0') {
      // Debit column has a value but it's 0 — might be a credit column mislabeled
      // Try to infer from balance direction
      const direction = curBal - prevBal;
      if (direction > 0) {
        credit = Math.abs(direction);
        debit = 0;
      }
    }

    const expected = prevBal + credit - debit;
    if (Math.abs(expected - curBal) > 0.02) {
      return { isSuspicious: true, suspiciousReason: `Balance mismatch: expected ${expected.toFixed(2)}, got ${curBal.toFixed(2)}` };
    }
    return { isSuspicious: false };
  });
}

function buildDocumentTransactions(
  cleaned: RawTx[],
  flags: { isSuspicious: boolean; suspiciousReason?: string }[],
  documentId: string,
  bankProfileId: string,
): DocumentTransactions[] {
  let globalId = 1;
  const pageMap = new Map<number, DocumentTransactions['result']['transactions']>();

  for (let i = 0; i < cleaned.length; i++) {
    const tx   = cleaned[i]!;
    const flag = flags[i]!;
    const entry = {
      id:               globalId++,
      date:             tx.date        ?? '',
      narration:        tx.description ?? '',
      rawText:          tx.description ?? '',
      sourceRows:       [] as number[],
      debit:            tx.debit       ?? '',
      credit:           tx.credit      ?? '',
      balance:          tx.balance     ?? '',
      isSuspicious:     flag.isSuspicious,
      suspiciousReason: flag.suspiciousReason,
    };
    if (!pageMap.has(tx.page)) pageMap.set(tx.page, []);
    pageMap.get(tx.page)!.push(entry);
  }

  const result: DocumentTransactions[] = [...pageMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, transactions]) => ({
      page,
      result: {
        classifiedRows:      [],
        transactions,
        headerRowId:         null,
        bankProfileId,
        unconsumedPreBuffer: [],
      },
    }));

  fs.writeFileSync(
    path.join(getDocumentDir(documentId), 'transactions.json'),
    JSON.stringify(result, null, 2)
  );

  return result;
}

async function runDirectExtraction(documentId: string, apiKey: string, pipelineId: string): Promise<DocumentTransactions[]> {
  const chandraJson = await runChandraOcr(documentId, apiKey, pipelineId);
  const { columns, rows } = parseDirectJson(chandraJson);
  const result = buildDirectDocumentTransactions(columns, rows);
  fs.writeFileSync(
    path.join(getDocumentDir(documentId), 'transactions.json'),
    JSON.stringify(result, null, 2)
  );
  return result;
}

async function runChandraExtraction(documentId: string, apiKey: string, pipelineId: string): Promise<DocumentTransactions[]> {
  const chandraJson = await runChandraOcr(documentId, apiKey, pipelineId);
  const chandraRaw  = await parseChandraJson(chandraJson);

  const allRaw: RawTx[] = chandraRaw.map(tx => ({
    date:        tx.date,
    description: tx.description,
    debit:       tx.debit,
    credit:      tx.credit,
    balance:     tx.balance,
    page:        tx.page,
  }));

  const cleaned = postProcess(allRaw);
  const flags   = balanceCheck(cleaned);
  return buildDocumentTransactions(cleaned, flags, documentId, 'chandra');
}

export async function runExtraction(documentId: string, mode?: string): Promise<DocumentTransactions[]> {
  const pdfType      = readPdfType(documentId);
  const effectiveMode = mode ?? process.env['EXTRACTION_MODE'] ?? 'llm';

  // direct mode: Datalab OCR → parse HTML tables directly, no LLM — works for both digital and scanned
  if (effectiveMode === 'direct') {
    const { key, pipelineId } = getDatalabCredentials();
    return runDirectExtraction(documentId, key, pipelineId);
  }

  if (pdfType === 'scanned') {
    const { key, pipelineId } = getDatalabCredentials();
    return runChandraExtraction(documentId, key, pipelineId);
  }

  const parsedJson = getParsedJson(documentId);

  // Build annotated page texts, carrying column detection across pages
  let lastCols: AmountColumns | null = null;
  const groqApiKey = process.env['GROQ_API_KEY'];
  if (!groqApiKey) throw new Error('GROQ_API_KEY not configured');

  const pageTexts = parsedJson.pages.map(p => {
    const cols = detectAmountColumns(p.textItems as TextItem[]) ?? lastCols;
    if (cols) lastCols = cols;
    return reconstructLines(p.textItems as TextItem[], cols);
  });

  // Extract page by page
  const allRaw: RawTx[] = [];
  for (let i = 0; i < pageTexts.length; i++) {
    const txns = await callGroqWithRetry(pageTexts[i]!.join('\n'), i + 1, groqApiKey);
    for (const tx of txns) allRaw.push({ ...tx, page: i + 1 });
  }

  const cleaned = postProcess(allRaw);
  const flags   = balanceCheck(cleaned);
  return buildDocumentTransactions(cleaned, flags, documentId, 'llm');
}
