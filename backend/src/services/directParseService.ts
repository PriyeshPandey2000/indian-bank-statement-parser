import type { DocumentTransactions } from './transactionService';

interface ChandraBlock {
  block_type: string;
  html: string;
  bbox?: number[];       // [x1, y1, x2, y2] in page coordinates
  children?: ChandraBlock[];
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

const DATE_RE   = /(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}[\s\-]+[A-Za-z]{3}[\s\-]+\d{4})/;
const AMOUNT_RE = /^[\d,]+(\.\d+)?$/;

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

interface ParsedTable {
  headers: string[];
  headerMids: number[];
  dataRows: { text: string; x: number | null }[][];
}

function parseTableFromChildren(children: ChandraBlock[]): ParsedTable | null {
  type RawCell = { text: string; x: number; y1: number; y2: number; isHeader: boolean };
  const rawCells: RawCell[] = [];

  for (const child of children) {
    if (!child.bbox || child.bbox.length < 4) continue;
    const [bx1, by1, bx2, by2] = child.bbox as [number, number, number, number];
    rawCells.push({
      text: stripHtml(child.html),
      x: (bx1 + bx2) / 2,
      y1: by1,
      y2: by2,
      isHeader: /<th[\s>]/i.test(child.html),
    });
  }

  if (!rawCells.length) return null;

  const headerCells = rawCells.filter(c => c.isHeader);
  const dataCells   = rawCells.filter(c => !c.isHeader);
  if (!headerCells.length) return null;

  headerCells.sort((a, b) => a.x - b.x);
  const headers    = headerCells.map(c => c.text);
  const headerMids = headerCells.map(c => c.x);

  // Group data cells into rows by Y overlap, then sort each row by X
  dataCells.sort((a, b) => (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2);

  const rowGroups: RawCell[][] = [];
  for (const cell of dataCells) {
    let placed = false;
    for (const group of rowGroups) {
      const gY1 = Math.min(...group.map(c => c.y1));
      const gY2 = Math.max(...group.map(c => c.y2));
      if (cell.y1 < gY2 && cell.y2 > gY1) { group.push(cell); placed = true; break; }
    }
    if (!placed) rowGroups.push([cell]);
  }

  const dataRows = rowGroups.map(g =>
    g.sort((a, b) => a.x - b.x).map(c => ({ text: c.text, x: c.x as number | null }))
  );

  return { headers, headerMids, dataRows };
}

// Extracts midX from the first <span data-bbox="..."> found anywhere in `content`.
// Handles both space-separated ("x1 y1 x2 y2") and comma-separated ("x1,y1,x2,y2").
function extractBboxX(content: string): number | null {
  const m = /data-bbox="([^"]+)"/.exec(content);
  if (!m) return null;
  const parts = m[1]!.trim().split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return (parts[0]! + parts[2]!) / 2;
}

// Linear interpolation for null gaps in a partial X array.
// Used to estimate X for always-empty columns so headerMids has the right length.
function interpolateMissingXs(xs: (number | null)[]): (number | null)[] {
  const out = [...xs];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== null) continue;
    let prev = -1, next = -1;
    for (let j = i - 1; j >= 0; j--) if (out[j] !== null) { prev = j; break; }
    for (let j = i + 1; j < out.length; j++) if (out[j] !== null) { next = j; break; }
    // Only interpolate when anchored on both sides. Edge nulls (no left or right neighbour)
    // are left as null so the caller falls back to positional alignment rather than
    // using an extrapolated guess that collapses all column midpoints to one value.
    if (prev >= 0 && next >= 0) {
      out[i] = out[prev]! + (out[next]! - out[prev]!) * (i - prev) / (next - prev);
    }
  }
  return out;
}

function parseTableFromHtml(html: string): ParsedTable {
  const headers: string[] = [];
  const headerXs: (number | null)[] = [];
  const dataRows: { text: string; x: number | null }[][] = [];

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html)) !== null) {
    const inner = trMatch[1]!;
    const ths: { text: string; x: number | null }[] = [];
    const tds: { text: string; x: number | null }[] = [];

    const thRe = /<th([^>]*)>([\s\S]*?)<\/th>/gi;
    let m: RegExpExecArray | null;
    // X from th content (handles bboxes on span inside th)
    while ((m = thRe.exec(inner)) !== null) ths.push({ text: stripHtml(m[2]!), x: extractBboxX(m[2]!) });

    const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    // X from td content — bbox is on <span> inside td, not on the td tag itself
    while ((m = tdRe.exec(inner)) !== null) tds.push({ text: stripHtml(m[2]!), x: extractBboxX(m[2]!) });

    if (ths.length && ths.some(h => h.text.length > 0)) {
      headers.length = 0;
      headerXs.length = 0;
      for (const th of ths) { headers.push(th.text); headerXs.push(th.x); }
    } else if (tds.length) {
      dataRows.push(tds);
    }
  }

  // Build headerMids from header bboxes if available, else from the best partial data row.
  // Only use interpolated values when every position is resolved (no edge nulls remain) —
  // partial geometry is worse than positional fallback.
  let headerMids: number[] = [];
  const trySetMids = (xs: (number | null)[]) => {
    const interp = interpolateMissingXs(xs);
    if (interp.every((x): x is number => x !== null)) headerMids = interp as number[];
  };
  if (headerXs.some(x => x !== null)) {
    trySetMids(headerXs);
  } else if (dataRows.length) {
    let bestRow: { text: string; x: number | null }[] | null = null;
    let bestCount = 0;
    for (const row of dataRows) {
      if (row.length !== headers.length) continue;
      const count = row.filter(c => c.x !== null).length;
      if (count > bestCount) { bestCount = count; bestRow = row; }
    }
    const threshold = Math.ceil(headers.length / 2);
    if (bestRow && bestCount >= threshold) trySetMids(bestRow.map(c => c.x));
  }

  return { headers, headerMids, dataRows };
}

function parseTable(block: ChandraBlock): ParsedTable {
  if (block.children?.length) {
    const result = parseTableFromChildren(block.children);
    if (result) return result;
  }
  return parseTableFromHtml(block.html);
}

// Returns the global column index that got merged (and should be empty) when a table
// block has fewer headers than expected. Compares local headers to the reference schema.
function detectMergedEmptyCol(globalCols: string[], localHeaders: string[]): number {
  if (localHeaders.length !== globalCols.length - 1) return -1;

  let gi = 0;
  for (let li = 0; li < localHeaders.length && gi < globalCols.length; li++, gi++) {
    const lh = localHeaders[li]!.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');

    if (gi + 1 < globalCols.length) {
      const ghKey  = globalCols[gi]!.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).find(w => w.length > 2) ?? '';
      const ghnKey = globalCols[gi + 1]!.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).find(w => w.length > 2) ?? '';

      if (ghKey && ghnKey && lh.includes(ghKey) && lh.includes(ghnKey)) {
        // localHeaders[li] spans two global columns — first one (gi) is the empty col
        return gi;
      }
    }
  }
  return -1;
}

function inferDateCol(textRows: string[][]): number {
  const scores: Record<number, number> = {};
  for (const row of textRows.slice(0, 15)) {
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

function assignToColumns(cells: { text: string; x: number | null }[], headerMids: number[]): string[] {
  const colCount = headerMids.length;
  const row = new Array<string>(colCount).fill('');

  for (const cell of cells) {
    if (cell.x === null) {
      // No position info — positional fallback handled outside
      continue;
    }
    let bestCol = 0;
    let bestDist = Math.abs(cell.x - headerMids[0]!);
    for (let i = 1; i < colCount; i++) {
      const dist = Math.abs(cell.x - headerMids[i]!);
      if (dist < bestDist) { bestDist = dist; bestCol = i; }
    }
    if (row[bestCol] === '') row[bestCol] = cell.text;
  }
  return row;
}

export function parseDirectJson(chandraJson: unknown): { columns: string[]; rows: DirectRow[] } {
  const json = chandraJson as ChandraJson;
  if (!Array.isArray(json?.children)) {
    throw new Error('Datalab response missing `children` array — unexpected response shape');
  }
  let columns: string[] = [];
  let headerMids: number[] = [];
  let dateCol = -1;
  const rows: DirectRow[] = [];

  for (let pi = 0; pi < json.children.length; pi++) {
    const page = json.children[pi]!;
    const pageNum = (page.page ?? pi) + 1;

    for (const block of (page.children ?? [])) {
      if (block.block_type !== 'Table') continue;

      const { headers, headerMids: hMids, dataRows } = parseTable(block);

      if (columns.length === 0 && headers.length > 0) {
        const hasDateHeader   = headers.some(h => /\b(txn\s*date|trans\s*date|value\s*date|posting\s*date|\bdate\b|dt)\b/i.test(h));
        const hasAmountHeader = headers.some(h => /withdrawal|deposit|debit|credit|\bdr\b|\bcr\b|amount|balance/i.test(h));
        if (!hasDateHeader || !hasAmountHeader) {
          console.log(`[DirectParser] skipping non-transaction table: ${JSON.stringify(headers)}`);
          continue;
        }

        columns = headers;
        headerMids = hMids;
        dateCol = columns.findIndex(h =>
          /\b(txn\s*date|trans\s*date|value\s*date|posting\s*date|\bdate\b|dt)\b/i.test(h)
        );
        const textRows = dataRows.map(r => r.map(c => c.text));
        if (dateCol < 0) dateCol = inferDateCol(textRows);

        const bboxMode = headerMids.length > 0;
        console.log(`[DirectParser] columns=${JSON.stringify(columns)} dateCol=${dateCol} bboxMode=${bboxMode}`);
      }

      const colCount = columns.length;
      const useBbox = headerMids.length === colCount;

      // Fallback: detect merged column by header-text when geometry isn't available globally.
      // Fires when: no global headerMids (useBbox=false) AND this block has fewer headers than schema.
      const mergedEmptyCol = (!useBbox && headers.length > 0 && headers.length < colCount)
        ? detectMergedEmptyCol(columns, headers)
        : -1;
      if (mergedEmptyCol >= 0) {
        console.log(`[DirectParser] page=${pageNum} merged headers detected, inserting empty at col ${mergedEmptyCol} (${columns[mergedEmptyCol]})`);
      }

      for (const cells of dataRows) {
        let aligned: string[];

        if (useBbox) {
          aligned = assignToColumns(cells, headerMids);
          if (aligned.every(v => v === '')) aligned = cells.map(c => c.text);
        } else {
          aligned = cells.map(c => c.text);
        }

        // Fix merged-column rows: insert empty string at the detected missing slot
        if (mergedEmptyCol >= 0 && aligned.length === colCount - 1) {
          aligned = [
            ...aligned.slice(0, mergedEmptyCol),
            '',
            ...aligned.slice(mergedEmptyCol),
          ];
        }

        if (!isTransactionRow(aligned, dateCol)) continue;
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
      id:           id++,
      date:         '',
      narration:    '',
      rawText:      row.values.join(' | '),
      sourceRows:   [],
      debit:        '',
      credit:       '',
      balance:      '',
      isSuspicious: false,
      rawValues:    row.values,
    });
  }

  return [...pageMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, transactions]) => ({
      page,
      result: {
        classifiedRows:      [],
        transactions,
        headerRowId:         null,
        bankProfileId:       'direct',
        unconsumedPreBuffer: [],
        directColumns:       columns,
        isDirectMode:        true,
      },
    }));
}
