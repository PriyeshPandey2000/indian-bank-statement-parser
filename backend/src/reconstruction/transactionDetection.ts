import type { ReconstructedRow } from './rowReconstruction';
import type { ColumnDefinition } from './columnDetection';
import { detectBankProfile, getBankProfileById, type BankProfile } from './bankProfiles';

export type RowType = 'HEADER' | 'TRANSACTION' | 'CONTINUATION' | 'OTHER';

export interface ClassifiedRow {
  row: ReconstructedRow;
  type: RowType;
}

export interface DetectedTransaction {
  id: number;
  date: string;
  narration: string;
  rawText: string;
  sourceRows: number[];
  debit: string;
  credit: string;
  balance: string;
  isSuspicious: boolean;
}

export interface TransactionDetectionResult {
  classifiedRows: ClassifiedRow[];
  transactions: DetectedTransaction[];
  headerRowId: number | null;
  bankProfileId: string;
}

const DATE_PATTERNS = [
  /^\d{2}\/\d{2}\/\d{4}/,
  /^\d{2}-\d{2}-\d{4}/,
  /^\d{2}\/\d{2}\/\d{2}(?!\d)/,
  /^\d{1,2}\s+[A-Za-z]{3},?\s+\d{4}/,   // "1 Apr 2025" or "DD MMM, YYYY" (SBI/Kotak)
  /^\d{2}-[A-Za-z]{3}-\d{4}/,
  /^\d{1,2}\s+[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}/, // "17 Apr 17 Apr" (SBI pages 2+)
];

const HEADER_KEYWORDS = [
  'tran date', 'trans date', 'value date', 'date',
  'particulars', 'narration', 'description', 'details',
  'debit', 'credit', 'balance', 'chq', 'cheque', 'ref',
];

// Stop scanning for headers once we hit these — they mark end of transaction data
const HEADER_STOP_PATTERNS = [
  /transaction\s+total/i,
  /closing\s+balance/i,
  /^legends\s*:/i,
  /charge\s+breakup/i,
  /end\s+of\s+statement/i,
];

function startsWithDate(text: string): boolean {
  const t = text.trim();
  return DATE_PATTERNS.some((p) => p.test(t));
}

function extractDate(text: string): string {
  const t = text.trim();
  for (const p of DATE_PATTERNS) {
    const m = t.match(p);
    if (m) return m[0];
  }
  return '';
}

function isHeaderRow(text: string): boolean {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of HEADER_KEYWORDS) {
    if (lower.includes(kw)) matches++;
  }
  return matches >= 2;
}

function isSpecialRow(text: string, profile: BankProfile): boolean {
  return profile.specialRows.some((sp) => sp.pattern.test(text));
}

/**
 * Build transactions for banks where narration rows come BEFORE the date row (e.g. Axis Bank).
 * Non-date rows after header accumulate in a buffer; the next date row consumes the buffer as
 * pre-narration and those buffered rows are marked CONTINUATION.
 */
function buildPreNarrationTransactions(
  rows: ReconstructedRow[],
  headerIdx: number,
  profile: BankProfile,
  columns: ColumnDefinition[]
): TransactionDetectionResult {
  const classified: ClassifiedRow[] = rows.map((row, idx) => ({
    row,
    type: idx === headerIdx ? 'HEADER' : ('OTHER' as RowType),
  }));

  const transactions: DetectedTransaction[] = [];
  let txId = 1;
  let preBuffer: ReconstructedRow[] = [];

  const markBuffer = (bufRows: ReconstructedRow[]) => {
    for (const pr of bufRows) {
      const idx = rows.findIndex((r) => r.rowId === pr.rowId);
      if (idx !== -1) classified[idx]!.type = 'CONTINUATION';
    }
  };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const c = classified[i]!;

    if (isSpecialRow(row.text, profile)) {
      c.type = 'OTHER';
      preBuffer = [];
      continue;
    }

    if (startsWithDate(row.text)) {
      c.type = 'TRANSACTION';
      markBuffer(preBuffer);

      const date = extractDate(row.text);
      const narration = profile.extractNarration(preBuffer, row, columns);
      const rawParts = [...preBuffer.map((r) => r.text), row.text];

      transactions.push({
        id: txId++,
        date,
        narration,
        rawText: rawParts.join(' | '),
        sourceRows: [...preBuffer.map((r) => r.rowId), row.rowId],
        debit: '',
        credit: '',
        balance: '',
        isSuspicious: false,
      });

      preBuffer = [];
    } else {
      // non-date row in pre-flow = potential narration for the next transaction
      preBuffer.push(row);
    }
  }

  for (const tx of transactions) {
    if (!tx.date || !tx.narration) tx.isSuspicious = true;
  }

  return {
    classifiedRows: classified,
    transactions,
    headerRowId: headerIdx !== -1 ? (rows[headerIdx]?.rowId ?? null) : null,
    bankProfileId: profile.id,
  };
}

/**
 * Build transactions for banks where continuation rows appear AFTER the date row (e.g. HDFC).
 * Works with or without a header row (headerIdx === -1 means no header on this page).
 */
function buildPostNarrationTransactions(
  rows: ReconstructedRow[],
  headerIdx: number,
  profile: BankProfile,
  columns: ColumnDefinition[]
): TransactionDetectionResult {
  const isTxRow = (row: ReconstructedRow) =>
    profile.isTransactionRow ? profile.isTransactionRow(row) : startsWithDate(row.text);

  const classified: ClassifiedRow[] = rows.map((row, idx) => {
    if (idx === headerIdx) return { row, type: 'HEADER' };
    if (idx < headerIdx) return { row, type: 'OTHER' };
    if (isSpecialRow(row.text, profile)) return { row, type: 'OTHER' };
    if (isTxRow(row)) return { row, type: 'TRANSACTION' };
    return { row, type: 'OTHER' };
  });

  // mark post-continuations
  const firstDataIdx = headerIdx === -1 ? 0 : headerIdx + 1;
  let inBlock = false;
  for (let i = firstDataIdx; i < classified.length; i++) {
    const c = classified[i]!;
    if (c.type === 'TRANSACTION') {
      inBlock = true;
    } else if (c.type === 'OTHER' && inBlock && c.row.text.trim().length > 0 &&
               !isSpecialRow(c.row.text, profile) &&
               !isHeaderRow(c.row.text)) {
      c.type = 'CONTINUATION';
    }
  }

  const transactions: DetectedTransaction[] = [];
  let txId = 1;
  let pendingContRows: ReconstructedRow[] = [];

  for (const c of classified) {
    if (c.type === 'TRANSACTION') {
      // Finalize previous transaction's date if resolveDate hook exists
      if (transactions.length > 0 && profile.resolveDate && pendingContRows.length > 0) {
        const prev = transactions[transactions.length - 1]!;
        prev.date = profile.resolveDate(prev.date, pendingContRows);
      }
      pendingContRows = [];

      const date = profile.extractDateFromRow
        ? profile.extractDateFromRow(c.row)
        : extractDate(c.row.text);
      const narration = profile.extractNarration([], c.row, columns);
      transactions.push({
        id: txId++,
        date,
        narration,
        rawText: c.row.text,
        sourceRows: [c.row.rowId],
        debit: '',
        credit: '',
        balance: '',
        isSuspicious: false,
      });
    } else if (c.type === 'CONTINUATION' && transactions.length > 0) {
      pendingContRows.push(c.row);
      const last = transactions[transactions.length - 1]!;
      const contNar = profile.extractContinuationNarration
        ? profile.extractContinuationNarration(c.row, columns)
        : c.row.text.trim();
      if (contNar) {
        last.narration = last.narration ? `${last.narration} ${contNar}` : contNar;
      }
      last.rawText = `${last.rawText} | ${c.row.text}`;
      last.sourceRows.push(c.row.rowId);
    }
  }

  // Finalize last transaction's date
  if (transactions.length > 0 && profile.resolveDate && pendingContRows.length > 0) {
    const last = transactions[transactions.length - 1]!;
    last.date = profile.resolveDate(last.date, pendingContRows);
  }

  for (const tx of transactions) {
    if (!tx.date || !tx.narration) tx.isSuspicious = true;
  }

  return {
    classifiedRows: classified,
    transactions,
    headerRowId: headerIdx !== -1 ? (rows[headerIdx]?.rowId ?? null) : null,
    bankProfileId: profile.id,
  };
}

export function detectTransactions(
  rows: ReconstructedRow[],
  columns: ColumnDefinition[] = [],
  forcedProfile?: BankProfile
): TransactionDetectionResult {
  if (rows.length === 0) {
    return { classifiedRows: [], transactions: [], headerRowId: null, bankProfileId: forcedProfile?.id ?? 'generic' };
  }

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const text = rows[i]!.text;
    if (HEADER_STOP_PATTERNS.some(p => p.test(text))) break;
    if (isHeaderRow(text)) {
      headerIdx = i;
      break;
    }
  }

  const headerRow = headerIdx !== -1 ? rows[headerIdx]! : null;
  // Use forced profile (carry-over from previous page) if no header found on this page
  const profile = forcedProfile ?? detectBankProfile(headerRow);

  if (profile.narrationFlow === 'pre') {
    return buildPreNarrationTransactions(rows, headerIdx, profile, columns);
  }
  return buildPostNarrationTransactions(rows, headerIdx, profile, columns);
}
