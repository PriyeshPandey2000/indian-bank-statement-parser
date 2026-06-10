import fs from 'fs';
import path from 'path';
import { getDocumentDir } from '../utils/storage';
import { getStoredRows } from './rowService';
import { getStoredTransactions, runTransactionDetection } from './transactionService';
import { detectColumns, fillTransactionAmounts, type ColumnDetectionResult, type ColumnDefinition } from '../reconstruction/columnDetection';
import { detectTransactions, type DetectedTransaction } from '../reconstruction/transactionDetection';
import type { ReconstructedRow } from '../reconstruction/rowReconstruction';
import type { DocumentTransactions } from './transactionService';
import { getBankProfileById } from '../reconstruction/bankProfiles';
import { getParsedJson } from './parseService';

function parseAmt(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

export function reconcileTransactions(txData: DocumentTransactions[]): void {
  const allTx: DetectedTransaction[] = txData.flatMap(p => p.result.transactions);
  for (let i = 0; i < allTx.length; i++) {
    const tx = allTx[i]!;
    const reasons: string[] = [];

    if (!tx.narration || tx.narration.trim().length < 2) reasons.push('empty narration');
    if (!tx.date) reasons.push('no date');

    if (i > 0) {
      const prev = allTx[i - 1]!;
      if (prev.balance && tx.balance) {
        const prevBal = parseAmt(prev.balance);
        const txBal   = parseAmt(tx.balance);
        // Forward-chrono: prev.balance - tx.debit + tx.credit = tx.balance
        const fwdExpected = Math.round((prevBal - parseAmt(tx.debit) + parseAmt(tx.credit)) * 100) / 100;
        // Reverse-chrono (e.g. PNB): tx.balance - prev.debit + prev.credit = prev.balance
        const revExpected = Math.round((txBal   - parseAmt(prev.debit) + parseAmt(prev.credit)) * 100) / 100;
        const actual = Math.round(txBal * 100) / 100;
        const prevActual = Math.round(prevBal * 100) / 100;
        const fwdOk = Math.abs(fwdExpected - actual) <= 0.01;
        const revOk = Math.abs(revExpected - prevActual) <= 0.01;
        if (!fwdOk && !revOk) {
          reasons.push(`balance mismatch (expected ${fwdExpected.toFixed(2)}, got ${actual.toFixed(2)})`);
        }
      }
    }

    tx.isSuspicious = reasons.length > 0;
    tx.suspiciousReason = reasons.length > 0 ? reasons.join('; ') : undefined;
  }
}

export interface PageColumnResult {
  page: number;
  columns: ColumnDetectionResult;
}

export function runColumnDetection(documentId: string): PageColumnResult[] {
  const pageRows = getStoredRows(documentId);
  const parsedJson = getParsedJson(documentId);

  // get or run transaction detection (need headerRowId)
  let txData = (() => {
    try { return getStoredTransactions(documentId); }
    catch { return runTransactionDetection(documentId); }
  })();

  const pageResults: PageColumnResult[] = [];
  // Carry profile + columns across pages that lack a header (multi-page statements)
  let lastKnownColumns: ColumnDefinition[] = [];
  let lastKnownProfileId = 'generic';
  // Carry pre-narration buffer for Axis-style banks across page boundaries
  let carryPreBuffer: ReconstructedRow[] = [];

  for (const pr of pageRows) {
    const parsedPage = parsedJson.pages.find((p) => p.page === pr.page);
    const txPage = txData.find((p) => p.page === pr.page);
    if (!parsedPage || !txPage) continue;

    const { headerRowId } = txPage.result;
    const rowMap = new Map(pr.rows.map((r) => [r.rowId, r]));

    if (headerRowId === null) {
      // No header on this page — carry over columns + profile from previous page
      const carryColumns = lastKnownColumns;
      pageResults.push({
        page: pr.page,
        columns: { columns: carryColumns, pageWidth: parsedPage.width },
      });

      if (carryColumns.length > 0) {
        const carryProfile = getBankProfileById(lastKnownProfileId);
        const refined = detectTransactions(pr.rows, carryColumns, carryProfile, carryPreBuffer);
        carryPreBuffer = refined.unconsumedPreBuffer;
        txPage.result.classifiedRows = refined.classifiedRows;
        txPage.result.transactions = refined.transactions;
        txPage.result.bankProfileId = lastKnownProfileId;
        txPage.result.transactions = fillTransactionAmounts(
          refined.transactions,
          rowMap,
          carryColumns
        );
      }
      continue;
    }

    const headerRow = pr.rows.find((r) => r.rowId === headerRowId);
    if (!headerRow) continue;

    const colResult = detectColumns(headerRow, parsedPage.width);
    lastKnownColumns = colResult.columns;
    pageResults.push({ page: pr.page, columns: colResult });

    // re-run transaction detection with column data so narration is clean
    // new header = fresh section, discard any carried pre-narration buffer
    carryPreBuffer = [];
    const refined = detectTransactions(pr.rows, colResult.columns);
    carryPreBuffer = refined.unconsumedPreBuffer;
    if (refined.bankProfileId !== 'generic') lastKnownProfileId = refined.bankProfileId;
    txPage.result.classifiedRows = refined.classifiedRows;
    txPage.result.transactions = refined.transactions;
    txPage.result.bankProfileId = refined.bankProfileId;

    // fill amounts from item positions (more precise than regex)
    txPage.result.transactions = fillTransactionAmounts(
      txPage.result.transactions,
      rowMap,
      colResult.columns
    );
  }

  // re-number IDs globally so they're unique across pages
  let globalId = 1;
  for (const item of txData) {
    for (const tx of item.result.transactions) {
      tx.id = globalId++;
    }
  }

  reconcileTransactions(txData);

  // persist column definitions
  const colPath = path.join(getDocumentDir(documentId), 'columns.json');
  fs.writeFileSync(colPath, JSON.stringify(pageResults, null, 2));

  // persist updated transactions (with filled amounts + reconciliation flags)
  const txPath = path.join(getDocumentDir(documentId), 'transactions.json');
  fs.writeFileSync(txPath, JSON.stringify(txData, null, 2));

  return pageResults;
}

export function getStoredColumns(documentId: string): PageColumnResult[] {
  const colPath = path.join(getDocumentDir(documentId), 'columns.json');
  if (!fs.existsSync(colPath)) {
    throw new Error(`No column data for document: ${documentId}`);
  }
  return JSON.parse(fs.readFileSync(colPath, 'utf-8')) as PageColumnResult[];
}
