import type { ReconstructedRow } from './rowReconstruction';
import type { ColumnDefinition } from './columnDetection';

/**
 * Narration flow describes how narration rows relate to the date row.
 *
 * 'pre'  — narration row(s) appear BEFORE the date row (Axis Bank, most Indian banks)
 * 'post' — narration row(s) appear AFTER the date row (some HDFC formats)
 */
export type NarrationFlow = 'pre' | 'post';

export interface SpecialRowPattern {
  pattern: RegExp;
  type: 'OPENING_BALANCE' | 'CLOSING_BALANCE' | 'SKIP';
}

export interface BankProfile {
  id: string;
  name: string;
  /** Return true if this profile matches the document's header row */
  detect: (headerRowText: string, headerItems: string[]) => boolean;
  narrationFlow: NarrationFlow;
  specialRows: SpecialRowPattern[];
  /**
   * Extract clean narration from a data row using column definitions.
   * Falls back to regex stripping when no column data available.
   */
  extractNarration: (
    preRows: ReconstructedRow[],
    dataRow: ReconstructedRow,
    columns: ColumnDefinition[]
  ) => string;
  /** Override default startsWithDate() check for banks where rows don't begin with dates */
  isTransactionRow?: (row: ReconstructedRow) => boolean;
  /** Override default extractDate() for banks with non-standard date placement in row text */
  extractDateFromRow?: (row: ReconstructedRow) => string;
  /** Extract narration from a CONTINUATION row (default: full row text) */
  extractContinuationNarration?: (row: ReconstructedRow, columns: ColumnDefinition[]) => string;
  /** Fix partial date (e.g. "17 Apr" without year) using data from continuation rows */
  resolveDate?: (partialDate: string, contRows: ReconstructedRow[]) => string;
}

// ── helpers ────────────────────────────────────────────────────────────────

function itemsInColumn(row: ReconstructedRow, col: ColumnDefinition): string[] {
  return row.items
    .filter((item) => {
      const center = item.x + item.width / 2;
      return center >= col.xStart && center < col.xEnd;
    })
    .map((i) => i.text.trim())
    .filter(Boolean);
}

function narrationItemsFromRow(
  row: ReconstructedRow,
  columns: ColumnDefinition[]
): string[] {
  const narCol = columns.find((c) => c.type === 'NARRATION');
  if (!narCol) {
    // No narration column — include text items not in date/amount columns
    const excludeTypes = new Set(['DATE', 'CHQ', 'DEBIT', 'CREDIT', 'BALANCE', 'AMOUNT', 'DR_CR']);
    return row.items
      .filter((item) => {
        const center = item.x + item.width / 2;
        const col = columns.find((c) => center >= c.xStart && center < c.xEnd);
        return !col || !excludeTypes.has(col.type);
      })
      .map((i) => i.text.trim())
      .filter(Boolean);
  }
  return itemsInColumn(row, narCol);
}

// ── profiles ───────────────────────────────────────────────────────────────

/**
 * Axis Bank — narration row comes BEFORE the date row.
 * Header has "Init." or "Tran Date" columns.
 */
export const AXIS_BANK_PROFILE: BankProfile = {
  id: 'axis',
  name: 'Axis Bank',
  detect: (headerText, headerItems) => {
    const lower = headerText.toLowerCase();
    return (
      lower.includes('tran date') ||
      lower.includes('init.') ||
      lower.includes('init ')  ||
      headerItems.some((h) => /^init\.?$/i.test(h.trim()))
    );
  },
  narrationFlow: 'pre',
  specialRows: [
    { pattern: /opening\s+balance/i,  type: 'OPENING_BALANCE' },
    { pattern: /closing\s+balance/i,  type: 'CLOSING_BALANCE' },
    { pattern: /^\s*total\s*$/i,      type: 'SKIP' },
  ],
  extractNarration: (preRows, dataRow, columns) => {
    const preParts = preRows.flatMap((r) => r.items.map((i) => i.text.trim())).filter(Boolean);

    // Axis date rows always place the narration tail starting at a fixed x (~132)
    // that can land in the CHQ column when text is short — center-based column
    // assignment misses these. Use item left-edge position instead:
    // narration zone = items whose x-start falls between DATE col end and first
    // DEBIT/CREDIT col start, filtering out purely numeric values.
    const dateCol  = columns.find(c => c.type === 'DATE');
    const debitCol = columns.find(c => c.type === 'DEBIT');
    const creditCol = columns.find(c => c.type === 'CREDIT');
    const firstAmountColStart = (debitCol ?? creditCol)?.xStart;

    let dataParts: string[];
    if (dateCol && firstAmountColStart !== undefined) {
      dataParts = dataRow.items
        .filter(i => i.x >= dateCol.xEnd && i.x < firstAmountColStart &&
                     !/^[\d,]+(\.\d+)?$/.test(i.text.trim()))
        .map(i => i.text.trim())
        .filter(Boolean);
    } else {
      dataParts = narrationItemsFromRow(dataRow, columns);
    }

    return [...preParts, ...dataParts].join(' ').replace(/\s+/g, ' ').trim();
  },
};

/**
 * HDFC Bank — continuation rows appear AFTER the date row.
 * Header usually has "Value Dt" or "Narration".
 */
export const HDFC_BANK_PROFILE: BankProfile = {
  id: 'hdfc',
  name: 'HDFC Bank',
  detect: (headerText) => {
    const lower = headerText.toLowerCase();
    return lower.includes('value dt') || lower.includes('narration');
  },
  narrationFlow: 'post',
  specialRows: [
    { pattern: /opening\s+balance/i, type: 'OPENING_BALANCE' },
    { pattern: /closing\s+balance/i, type: 'CLOSING_BALANCE' },
  ],
  extractNarration: (_preRows, dataRow, columns) => {
    // HDFC: narration is all text in narration column on the date row
    // continuation rows are appended later by the detection algorithm
    return narrationItemsFromRow(dataRow, columns).join(' ').replace(/\s+/g, ' ').trim();
  },
};

/**
 * Kotak Mahindra Bank — post-narration flow.
 * Dates formatted as "DD MMM, YYYY" (e.g. "08 Jun, 2025").
 * Header has "Withdrawal" or "Deposit" columns.
 */
// Kotak embeds date + narration in one PDF text item — strip the date prefix
const KOTAK_DATE_PREFIX = /^\d{2}\s+[A-Za-z]{3},?\s+\d{4}\s*/;

export const KOTAK_BANK_PROFILE: BankProfile = {
  id: 'kotak',
  name: 'Kotak Mahindra Bank',
  detect: (headerText) => {
    const lower = headerText.toLowerCase();
    return (
      lower.includes('withdrawal') ||
      lower.includes('transaction details') ||
      lower.includes('kotak')
    );
  },
  narrationFlow: 'post',
  specialRows: [
    { pattern: /opening\s+balance/i, type: 'OPENING_BALANCE' },
    { pattern: /closing\s+balance/i, type: 'CLOSING_BALANCE' },
    { pattern: /^\s*total\s*$/i,     type: 'SKIP' },
  ],
  extractNarration: (_preRows, dataRow, columns) => {
    const raw = narrationItemsFromRow(dataRow, columns).join(' ').replace(/\s+/g, ' ').trim();
    return raw.replace(KOTAK_DATE_PREFIX, '').trim();
  },
};

/**
 * Punjab National Bank — single Amount(INR) + Type(DR/CR) column pattern.
 * Header has "Instrument ID" and "Amount(INR)" columns.
 */
export const PNB_BANK_PROFILE: BankProfile = {
  id: 'pnb',
  name: 'Punjab National Bank',
  detect: (headerText) => {
    const lower = headerText.toLowerCase();
    return (
      lower.includes('instrument id') ||
      lower.includes('amount(inr)') ||
      lower.includes('amt(inr)')
    );
  },
  narrationFlow: 'post',
  specialRows: [
    { pattern: /opening\s+balance/i,               type: 'OPENING_BALANCE' },
    { pattern: /closing\s+balance/i,               type: 'CLOSING_BALANCE' },
    { pattern: /^\s*total\s*$/i,                   type: 'SKIP' },
    { pattern: /\bPage\s+\d+\b/i,                 type: 'SKIP' },  // page footer
  ],
  extractNarration: (_preRows, dataRow, columns) => {
    return narrationItemsFromRow(dataRow, columns).join(' ').replace(/\s+/g, ' ').trim();
  },
};

// Shared helper: extract narration items positionally from xStart of narCol to firstAmountCol start
function positionalNarration(
  row: ReconstructedRow,
  columns: ColumnDefinition[],
  opts?: { skipYears?: boolean; skipLongNums?: boolean }
): string {
  const narCol = columns.find(c => c.type === 'NARRATION');
  const debitCol = columns.find(c => c.type === 'DEBIT');
  const creditCol = columns.find(c => c.type === 'CREDIT');
  const firstAmountColStart = (debitCol ?? creditCol)?.xStart;
  if (!narCol || firstAmountColStart === undefined) {
    return narrationItemsFromRow(row, columns).join(' ').replace(/\s+/g, ' ').trim();
  }
  return row.items
    .filter(i => i.x >= narCol.xStart && i.x < firstAmountColStart)
    .filter(i => !opts?.skipYears   || !/^\d{4}$/.test(i.text.trim()))
    .filter(i => !opts?.skipLongNums || !/^\d{10,}$/.test(i.text.trim()))
    .map(i => i.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * State Bank of India — post-narration flow.
 * Date format: "D Mon YYYY" (e.g. "1 Apr 2025").
 * Pages 2+: dates split across rows — "17 Apr" on main row, "2025" on first continuation row.
 * Two date columns (Txn Date + Value Date) — only Txn Date is DATE column, Value Date is UNKNOWN.
 */
export const SBI_BANK_PROFILE: BankProfile = {
  id: 'sbi',
  name: 'State Bank of India',
  detect: (headerText) => {
    const lower = headerText.toLowerCase();
    return lower.includes('txn date') || lower.includes('ref no./cheque');
  },
  narrationFlow: 'post',
  specialRows: [
    { pattern: /opening\s+balance/i, type: 'OPENING_BALANCE' },
    { pattern: /closing\s+balance/i, type: 'CLOSING_BALANCE' },
    { pattern: /^\s*total\s*$/i,     type: 'SKIP' },
    { pattern: /^Txn\s+Date\b/i,     type: 'SKIP' },  // page-boundary header preview at bottom of page
    { pattern: /^Date\s+No\.?\s*$/i, type: 'SKIP' },  // sub-header continuation row
  ],
  isTransactionRow: (row) => {
    // First item in date column range (x 40-75) looks like "D Mon" or "D Mon YYYY"
    const firstDateItem = row.items.find(i => i.x >= 40 && i.x <= 75);
    return firstDateItem !== undefined && /^\d{1,2}\s+[A-Za-z]{3}/.test(firstDateItem.text.trim());
  },
  extractDateFromRow: (row) => {
    // Full date "D Mon YYYY" present on page 1
    const full = row.text.match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/);
    if (full) return full[0];
    // Partial date from first date item — year will be resolved from continuation row
    const dateItem = row.items.find(i => i.x >= 40 && i.x <= 75);
    const partial = dateItem?.text.match(/\d{1,2}\s+[A-Za-z]{3}/);
    return partial ? partial[0] : '';
  },
  resolveDate: (partialDate, contRows) => {
    if (partialDate && !/\d{4}/.test(partialDate)) {
      const yearMatch = contRows[0]?.text.match(/^\d{4}/);
      if (yearMatch) return `${partialDate.trim()} ${yearMatch[0]}`;
    }
    return partialDate;
  },
  extractNarration: (_preRows, dataRow, columns) =>
    positionalNarration(dataRow, columns, { skipYears: true, skipLongNums: true }),
  extractContinuationNarration: (row, columns) =>
    positionalNarration(row, columns, { skipYears: true, skipLongNums: true }),
};

/**
 * ICICI Bank — post-narration flow.
 * Multi-line header; rows start with serial number + tran ID + dates.
 * Date format: "02/Dec/2024" (DD/Mon/YYYY).
 * Debit column labelled "Withdra(wal)", credit labelled "Deposit".
 */
export const ICICI_BANK_PROFILE: BankProfile = {
  id: 'icici',
  name: 'ICICI Bank',
  detect: (headerText) => {
    const lower = headerText.toLowerCase();
    return (lower.includes('withdra') && lower.includes('deposit')) ||
           lower.includes('tran id');
  },
  narrationFlow: 'post',
  specialRows: [
    { pattern: /opening\s+balance/i, type: 'OPENING_BALANCE' },
    { pattern: /closing\s+balance/i, type: 'CLOSING_BALANCE' },
  ],
  isTransactionRow: (row) =>
    /^\d+\s+[A-Z]\d+\s+\d{2}\/[A-Za-z]{3}\//.test(row.text),
  extractDateFromRow: (row) => {
    // Pick the full Transaction Date item at x≈175 (DD/Mon/YYYY with 4-digit year)
    const dateItem = row.items.find(i =>
      i.x >= 165 && i.x <= 215 && /\d{2}\/[A-Za-z]{3}\/\d{4}/.test(i.text)
    );
    if (dateItem) return dateItem.text.trim();
    const m = row.text.match(/\d{2}\/[A-Za-z]{3}\/\d{4}/);
    return m ? m[0] : '';
  },
  extractNarration: (_preRows, dataRow, columns) => {
    // Remarks column: items between CHQ col end and DEBIT col start
    const chqCol  = columns.find(c => c.type === 'CHQ');
    const debitCol = columns.find(c => c.type === 'DEBIT');
    const creditCol = columns.find(c => c.type === 'CREDIT');
    const narStartX = chqCol ? chqCol.xEnd : 310;
    const narEndX = (debitCol ?? creditCol)?.xStart ?? 396;
    const parts = dataRow.items
      .filter(i => { const cx = i.x + i.width / 2; return cx >= narStartX && cx < narEndX; })
      .map(i => i.text.trim())
      .filter(Boolean);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  },
  extractContinuationNarration: (row, columns) => {
    const chqCol = columns.find(c => c.type === 'CHQ');
    const debitCol = columns.find(c => c.type === 'DEBIT');
    const creditCol = columns.find(c => c.type === 'CREDIT');
    const narStartX = chqCol ? chqCol.xEnd : 310;
    const narEndX = (debitCol ?? creditCol)?.xStart ?? 396;
    return row.items
      .filter(i => { const cx = i.x + i.width / 2; return cx >= narStartX && cx < narEndX; })
      .map(i => i.text.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
};

/**
 * Generic fallback — tries post-narration flow.
 */
export const GENERIC_PROFILE: BankProfile = {
  id: 'generic',
  name: 'Generic Bank',
  detect: () => true,
  narrationFlow: 'post',
  specialRows: [
    { pattern: /opening\s+balance/i, type: 'OPENING_BALANCE' },
    { pattern: /closing\s+balance/i, type: 'CLOSING_BALANCE' },
  ],
  extractNarration: (_preRows, dataRow, columns) => {
    return narrationItemsFromRow(dataRow, columns).join(' ').replace(/\s+/g, ' ').trim();
  },
};

// Profile registry — add new banks here
const PROFILES: BankProfile[] = [AXIS_BANK_PROFILE, HDFC_BANK_PROFILE, KOTAK_BANK_PROFILE, PNB_BANK_PROFILE, SBI_BANK_PROFILE, ICICI_BANK_PROFILE, GENERIC_PROFILE];

export function detectBankProfile(
  headerRow: ReconstructedRow | null
): BankProfile {
  if (!headerRow) return GENERIC_PROFILE;
  const headerText = headerRow.text;
  const headerItems = headerRow.items.map((i) => i.text);
  return PROFILES.find((p) => p.detect(headerText, headerItems)) ?? GENERIC_PROFILE;
}

export function getBankProfileById(id: string): BankProfile {
  return PROFILES.find((p) => p.id === id) ?? GENERIC_PROFILE;
}
