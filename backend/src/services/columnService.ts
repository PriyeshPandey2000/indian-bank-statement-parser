import fs from 'fs';
import path from 'path';
import { getDocumentDir } from '../utils/storage';
import { getStoredRows } from './rowService';
import { getStoredTransactions, runTransactionDetection } from './transactionService';
import { detectColumns, fillTransactionAmounts, type ColumnDetectionResult, type ColumnDefinition } from '../reconstruction/columnDetection';
import { detectTransactions } from '../reconstruction/transactionDetection';
import { getBankProfileById } from '../reconstruction/bankProfiles';
import { getParsedJson } from './parseService';

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
        const refined = detectTransactions(pr.rows, carryColumns, carryProfile);
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
    const refined = detectTransactions(pr.rows, colResult.columns);
    lastKnownProfileId = refined.bankProfileId;
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

  // persist column definitions
  const colPath = path.join(getDocumentDir(documentId), 'columns.json');
  fs.writeFileSync(colPath, JSON.stringify(pageResults, null, 2));

  // persist updated transactions (with filled amounts)
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
