import fs from 'fs';
import path from 'path';
import { getDocumentDir } from '../utils/storage';
import { getStoredRows } from './rowService';
import { detectTransactions, type TransactionDetectionResult } from '../reconstruction/transactionDetection';
import { getBankProfileById, type BankProfile } from '../reconstruction/bankProfiles';

export interface DocumentTransactions {
  page: number;
  result: TransactionDetectionResult;
}

export function runTransactionDetection(documentId: string): DocumentTransactions[] {
  const pageRows = getStoredRows(documentId);

  let lastProfile: BankProfile | undefined;
  const result: DocumentTransactions[] = pageRows.map((pr) => {
    const detResult = detectTransactions(pr.rows, [], lastProfile);
    // Carry forward detected profile so header-less pages (e.g. last page) use correct bank logic
    const detected = getBankProfileById(detResult.bankProfileId);
    if (detected.id !== 'generic') lastProfile = detected;
    return { page: pr.page, result: detResult };
  });

  // globally unique IDs across pages so React keys don't collide
  let globalId = 1;
  for (const item of result) {
    for (const tx of item.result.transactions) {
      tx.id = globalId++;
    }
  }

  const txPath = path.join(getDocumentDir(documentId), 'transactions.json');
  fs.writeFileSync(txPath, JSON.stringify(result, null, 2));

  return result;
}

export function getStoredTransactions(documentId: string): DocumentTransactions[] {
  const txPath = path.join(getDocumentDir(documentId), 'transactions.json');
  if (!fs.existsSync(txPath)) {
    throw new Error(`No transactions for document: ${documentId}`);
  }
  return JSON.parse(fs.readFileSync(txPath, 'utf-8')) as DocumentTransactions[];
}
