import type { DocumentTransactions } from './transactionService';

interface ChandraBlock {
  block_type: string;
  html: string;
}

interface ChandraPage {
  page?: number;
  children?: ChandraBlock[];
}

interface ChandraJson {
  children: ChandraPage[];
}

interface DirectRow {
  values: string[];
  page: number;
}

const DATE_RE   = /\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/;
const AMOUNT_RE = /^[\d,]+(\.\d+)?$/;

// Classify a column by its header name
function colKind(h: string): 'date' | 'balance' | 'txnamount' | 'ref' | 'narration' | 'other' {
  const l = h.toLowerCase();
  if (/\b(date|dt)\b/.test(l)) return 'date';
  if (/balance/.test(l)) return 'balance';
  if (/withdrawal|deposit|\bdebit\b|\bcredit\b|\bdr\b|\bcr\b|\bamount\b/.test(l)) return 'txnamount';
  if (/chq|cheque|check|ref(?:erence)?/.test(l)) return 'ref';
  if (/particulars|description|narration|details|remarks/.test(l)) return 'narration';
  return 'other';
}

// When a row has fewer cells than columns (empty <td>s omitted by the PDF parser),
// use column-type semantics to insert the missing empty cells at the right positions.
// Strategy:
//   1. anchor date
//   2. balance col  ← rightmost decimal amount in pool
//   3. trailing 'other' cols (branch codes etc.) ← rightmost short integer codes
//   4. txnamount cols ← remaining decimal amounts, left-to-right
//   5. narration cols ← remaining text
//   6. ref cols  ← always '' (Chq No etc. omitted because empty)
function realignCells(cells: string[], columns: string[], dateCol: number): string[] {
  const colCount = columns.length;
  if (cells.length >= colCount) return cells.slice(0, colCount);

  const result: string[] = new Array(colCount).fill('');
  const kinds = columns.map(colKind);

  const isDecimalAmt = (v: string) => v.includes('.') && AMOUNT_RE.test(v.replace(/,/g, '').trim());
  const isShortCode  = (v: string) => /^\d{1,6}$/.test(v.trim()); // branch codes like 679, 006

  // Anchor date
  result[dateCol] = cells[dateCol] ?? '';
  const pool = cells.filter((_, i) => i !== dateCol);

  // Pass 1 — balance: rightmost decimal amount
  const balanceCols = kinds.map((k, i) => k === 'balance' ? i : -1).filter(i => i >= 0).reverse();
  for (const col of balanceCols) {
    const ri = [...pool].map((v, i) => ({ v, i })).reverse().find(x => isDecimalAmt(x.v));
    if (ri) { result[col] = ri.v; pool.splice(ri.i, 1); }
  }

  // Pass 2 — trailing 'other' cols: rightmost short integer code
  const trailingOther: number[] = [];
  for (let i = colCount - 1; i >= 0; i--) {
    if (kinds[i] === 'other') trailingOther.unshift(i);
    else break;
  }
  for (const col of [...trailingOther].reverse()) {
    const ri = [...pool].map((v, i) => ({ v, i })).reverse().find(x => isShortCode(x.v));
    if (ri) { result[col] = ri.v; pool.splice(ri.i, 1); }
  }

  // Pass 3 — txnamount cols: remaining decimal amounts, left-to-right
  const txnCols = kinds.map((k, i) => k === 'txnamount' ? i : -1).filter(i => i >= 0);
  for (const col of txnCols) {
    const li = pool.findIndex(v => isDecimalAmt(v));
    if (li >= 0) { result[col] = pool.splice(li, 1)[0]!; }
  }

  // Pass 4 — narration cols: remaining text
  const narrationCols = kinds.map((k, i) => k === 'narration' ? i : -1).filter(i => i >= 0);
  for (const col of narrationCols) {
    if (result[col] === '' && pool.length > 0) result[col] = pool.shift()!;
  }

  // Pass 5 — spill: any leftover pool values into first empty non-ref slot
  for (let col = 0; col < colCount && pool.length > 0; col++) {
    if (result[col] === '' && kinds[col] !== 'ref') result[col] = pool.shift()!;
  }

  return result;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTable(html: string): { headers: string[]; dataRows: string[][] } {
  const headers: string[] = [];
  const dataRows: string[][] = [];

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html)) !== null) {
    const inner = trMatch[1]!;
    const ths: string[] = [];
    const tds: string[] = [];

    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let m: RegExpExecArray | null;
    while ((m = thRe.exec(inner)) !== null) ths.push(stripHtml(m[1]!));

    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((m = tdRe.exec(inner)) !== null) tds.push(stripHtml(m[1]!));

    if (ths.length && ths.some(h => h.length > 0)) {
      headers.length = 0;
      headers.push(...ths);
    } else if (tds.length) {
      dataRows.push(tds);
    }
  }

  return { headers, dataRows };
}

function inferDateCol(dataRows: string[][]): number {
  const scores: Record<number, number> = {};
  for (const row of dataRows.slice(0, 15)) {
    row.forEach((cell, i) => {
      if (DATE_RE.test(cell.trim())) scores[i] = (scores[i] || 0) + 1;
    });
  }
  const best = Object.entries(scores).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return best ? parseInt(best[0]) : -1;
}

function isTransactionRow(cells: string[], dateCol: number): boolean {
  if (dateCol < 0 || dateCol >= cells.length) return false;
  if (!DATE_RE.test(cells[dateCol]?.trim() ?? '')) return false;
  return cells.some((c, i) => i !== dateCol && AMOUNT_RE.test(c.replace(/,/g, '').trim()) && c.trim().length > 0);
}

export function parseDirectJson(chandraJson: unknown): { columns: string[]; rows: DirectRow[] } {
  const json = chandraJson as ChandraJson;
  if (!Array.isArray(json?.children)) {
    throw new Error('Datalab response missing `children` array — unexpected response shape');
  }
  let columns: string[] = [];
  let dateCol = -1;
  const rows: DirectRow[] = [];

  for (let pi = 0; pi < json.children.length; pi++) {
    const page = json.children[pi]!;
    const pageNum = (page.page ?? pi) + 1;

    for (const block of (page.children ?? [])) {
      if (block.block_type !== 'Table') continue;

      const { headers, dataRows } = parseTable(block.html);

      if (columns.length === 0 && headers.length > 0) {
        // Skip tables that aren't transaction tables — must have a date header AND an amount header.
        // Prevents locking onto account-info or legend tables that appear before the transaction table.
        const hasDateHeader   = headers.some(h => /\b(txn\s*date|trans\s*date|value\s*date|posting\s*date|\bdate\b|dt)\b/i.test(h));
        const hasAmountHeader = headers.some(h => /withdrawal|deposit|debit|credit|\bdr\b|\bcr\b|amount|balance/i.test(h));
        if (!hasDateHeader || !hasAmountHeader) {
          console.log(`[DirectParser] skipping non-transaction table: ${JSON.stringify(headers)}`);
          continue;
        }

        columns = headers;
        dateCol = columns.findIndex(h =>
          /\b(txn\s*date|trans\s*date|value\s*date|posting\s*date|\bdate\b|dt)\b/i.test(h)
        );
        if (dateCol < 0) dateCol = inferDateCol(dataRows);
        console.log(`[DirectParser] columns=${JSON.stringify(columns)} dateCol=${dateCol}`);
      }

      for (const cells of dataRows) {
        if (!isTransactionRow(cells, dateCol)) continue;
        const colCount = columns.length;
        const aligned = realignCells(cells, columns, dateCol);
        rows.push({ values: Array.from({ length: colCount }, (_, i) => aligned[i] ?? ''), page: pageNum });
      }
    }
  }

  console.log(`[DirectParser] total rows=${rows.length}`);
  return { columns, rows };
}

export function buildDirectDocumentTransactions(
  columns: string[],
  rows: DirectRow[],
): DocumentTransactions[] {
  const pageMap = new Map<number, DocumentTransactions['result']['transactions']>();

  let id = 1;
  for (const row of rows) {
    if (!pageMap.has(row.page)) pageMap.set(row.page, []);
    pageMap.get(row.page)!.push({
      id:            id++,
      date:          '',
      narration:     '',
      rawText:       row.values.join(' | '),
      sourceRows:    [],
      debit:         '',
      credit:        '',
      balance:       '',
      isSuspicious:  false,
      rawValues:     row.values,
    });
  }

  return [...pageMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, transactions]) => ({
      page,
      result: {
        classifiedRows:       [],
        transactions,
        headerRowId:          null,
        bankProfileId:        'direct',
        unconsumedPreBuffer:  [],
        directColumns:        columns,
        isDirectMode:         true,
      },
    }));
}
