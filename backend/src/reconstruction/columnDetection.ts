import type { JsonTextItem } from '@llamaindex/liteparse';
import type { ReconstructedRow } from './rowReconstruction';
import type { DetectedTransaction } from './transactionDetection';

export type ColumnType = 'DATE' | 'CHQ' | 'NARRATION' | 'DEBIT' | 'CREDIT' | 'BALANCE' | 'AMOUNT' | 'DR_CR' | 'UNKNOWN';

export interface ColumnDefinition {
  type: ColumnType;
  label: string;     // text found in header
  xStart: number;   // left boundary of column
  xEnd: number;     // right boundary of column
  centerX: number;  // center of the header item
}

export interface ColumnDetectionResult {
  columns: ColumnDefinition[];
  pageWidth: number;
}

const COLUMN_KEYWORDS: Partial<Record<ColumnType, string[]>> = {
  DATE:      ['tran date', 'trans date', 'value date', 'posting date', 'date'],
  CHQ:       ['chq no', 'chq', 'cheque', 'ref no', 'ref', 'init', 'instrument id', 'instrument no'],
  NARRATION: ['particulars', 'narration', 'description', 'details', 'transaction details', 'remarks'],
  DEBIT:     ['debit amt', 'debit amount', 'debit', 'withdrawal', 'withdrawals', 'withdra', 'dr'],
  CREDIT:    ['credit amt', 'credit amount', 'credit', 'deposit', 'deposits', 'cr'],
  BALANCE:   ['running balance', 'running bal', 'closing bal', 'balance', 'bal'],
  // PNB-style: single amount column + separate DR/CR type column
  AMOUNT:    ['amount(inr)', 'amount (inr)', 'amt(inr)', 'amt (inr)'],
  DR_CR:     ['type'],
};

// Order matters — more specific keywords first; DEBIT/CREDIT before AMOUNT to avoid false matches
const COLUMN_PRIORITY: ColumnType[] = ['DATE', 'CHQ', 'NARRATION', 'DEBIT', 'CREDIT', 'BALANCE', 'AMOUNT', 'DR_CR'];

function classifyHeaderItem(text: string): ColumnType {
  const lower = text.toLowerCase().trim();
  for (const type of COLUMN_PRIORITY) {
    const keywords = COLUMN_KEYWORDS[type] ?? [];
    if (keywords.some((kw) => lower.includes(kw))) return type;
  }
  return 'UNKNOWN';
}

/**
 * Detect column layout from a header row's text items.
 * Returns column definitions sorted left-to-right.
 */
export function detectColumns(
  headerRow: ReconstructedRow,
  pageWidth: number
): ColumnDetectionResult {
  // Sort header items left to right
  const items = [...headerRow.items].sort((a, b) => a.x - b.x);

  // Classify each header item
  const classified: Array<{ item: JsonTextItem; type: ColumnType }> = items.map((item) => ({
    item,
    type: classifyHeaderItem(item.text),
  }));

  // Build column definitions with boundaries
  const columns: ColumnDefinition[] = classified.map(({ item, type }, idx) => {
    const centerX = item.x + item.width / 2;
    const nextItem = classified[idx + 1]?.item;

    const xStart = idx === 0 ? 0 : (() => {
      const prevCenter = classified[idx - 1]!.item.x + classified[idx - 1]!.item.width / 2;
      return (prevCenter + centerX) / 2;
    })();

    const xEnd = nextItem
      ? (centerX + (nextItem.x + nextItem.width / 2)) / 2
      : pageWidth;

    return { type, label: item.text, xStart, xEnd, centerX };
  });

  return { columns, pageWidth };
}

/**
 * Given a text item and column definitions, return the column it belongs to.
 * Uses the item's horizontal center for assignment.
 */
function assignItemToColumn(item: JsonTextItem, columns: ColumnDefinition[]): ColumnDefinition | null {
  const center = item.x + item.width / 2;
  return columns.find((col) => center >= col.xStart && center < col.xEnd) ?? null;
}

/**
 * Re-process transactions: fill debit, credit, balance from item positions.
 * Handles both standard (separate Debit/Credit cols) and PNB-style (Amount + DR_CR type col).
 */
export function fillTransactionAmounts(
  transactions: DetectedTransaction[],
  rowMap: Map<number, ReconstructedRow>,
  columns: ColumnDefinition[]
): DetectedTransaction[] {
  const amountCols = new Set<ColumnType>(['DEBIT', 'CREDIT', 'BALANCE', 'AMOUNT', 'DR_CR']);

  return transactions.map((tx) => {
    const updated = { ...tx };
    let pendingAmount: string | null = null;
    let pendingType: string | null = null;
    // Tracks split amounts awaiting decimal continuation.
    // Two PDF patterns exist:
    //   Case A — trailing-dot integer: "8,00,000." then "00" on next row
    //   Case B — plain integer + leading-dot decimal: "24,73,450" then ".77" on next row
    const splitPartial: Partial<Record<'DEBIT' | 'CREDIT' | 'BALANCE', string>> = {};

    const setField = (type: 'DEBIT' | 'CREDIT' | 'BALANCE', val: string) => {
      if (type === 'DEBIT'   && !updated.debit)   updated.debit   = val;
      if (type === 'CREDIT'  && !updated.credit)  updated.credit  = val;
      if (type === 'BALANCE' && !updated.balance) updated.balance = val;
    };

    const updateField = (type: 'DEBIT' | 'CREDIT' | 'BALANCE', val: string) => {
      if (type === 'DEBIT')   updated.debit   = val;
      if (type === 'CREDIT')  updated.credit  = val;
      if (type === 'BALANCE') updated.balance = val;
    };

    for (const rowId of tx.sourceRows) {
      const row = rowMap.get(rowId);
      if (!row) continue;

      for (const item of row.items) {
        const col = assignItemToColumn(item, columns);
        if (!col || !amountCols.has(col.type)) continue;

        const val = item.text.trim().replace(/\s+/g, '');  // strip intra-number spaces e.g. "31, 447.18"
        if (!val) continue;

        if (col.type === 'DR_CR') {
          pendingType ??= val.toUpperCase();
          continue;
        }

        if (col.type === 'AMOUNT') {
          const numeric = val.replace(/^[+-]/, '');
          if (/^[\d,]+(\.\d+)?$/.test(numeric)) pendingAmount ??= numeric;
          continue;
        }

        // standard debit/credit/balance columns
        const colType = col.type as 'DEBIT' | 'CREDIT' | 'BALANCE';
        const numeric = val.replace(/^[+-]/, '');

        // Case A: integer part ends with dot — "8,00,000." → store, await "00" continuation
        if (/^[\d,]+\.$/.test(numeric)) {
          splitPartial[colType] ??= numeric.slice(0, -1);
          continue;
        }

        // Case A continuation: 1-4 raw digits following a trailing-dot integer
        if (splitPartial[colType] !== undefined && /^\d{1,4}$/.test(numeric)) {
          const combined = `${splitPartial[colType]}.${numeric}`;
          delete splitPartial[colType];
          setField(colType, combined);
          continue;
        }

        // Case B: leading-dot decimal — ".77" appends to previously assigned integer value
        if (/^\.\d+$/.test(numeric)) {
          const current = colType === 'DEBIT' ? updated.debit
                        : colType === 'CREDIT' ? updated.credit
                        : updated.balance;
          if (current && !/\./.test(current)) {
            updateField(colType, `${current}${numeric}`);
          }
          continue;
        }

        if (!/^[\d,]+(\.\d+)?$/.test(numeric)) continue;

        // Plain integer — assign it; also mark in splitPartial in case a ".XX" decimal follows (Case B)
        setField(colType, numeric);
        if (!/\./.test(numeric)) splitPartial[colType] ??= numeric;
      }
    }

    // Flush any remaining trailing-dot partials that had no decimal continuation
    for (const [t, v] of Object.entries(splitPartial) as Array<['DEBIT' | 'CREDIT' | 'BALANCE', string]>) {
      setField(t, v);
    }

    // PNB-style: resolve combined amount + DR/CR type
    if (pendingAmount) {
      if (pendingType === 'DR' && !updated.debit)   updated.debit   = pendingAmount;
      if (pendingType === 'CR' && !updated.credit)  updated.credit  = pendingAmount;
    }

    return updated;
  });
}
