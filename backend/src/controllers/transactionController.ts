import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { runTransactionDetection, getStoredTransactions } from '../services/transactionService';
import { reconcileTransactions } from '../services/columnService';
import { getDocumentDir } from '../utils/storage';
import type { DocumentTransactions } from '../services/transactionService';

export function detectDocumentTransactions(req: Request, res: Response): void {
  const id = req.params['id'] as string;

  if (!documentExists(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  try {
    const result = runTransactionDetection(id);
    const totalTx = result.reduce((s, p) => s + p.result.transactions.length, 0);
    const totalRows = result.reduce((s, p) => s + p.result.classifiedRows.length, 0);
    res.json({ documentId: id, totalTransactions: totalTx, totalRows, pages: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Detection failed';
    res.status(500).json({ error: message });
  }
}

export function getDocumentTransactions(req: Request, res: Response): void {
  const id = req.params['id'] as string;
  try {
    const result = getStoredTransactions(id);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not found';
    res.status(404).json({ error: message });
  }
}

export function patchDocumentTransactions(req: Request, res: Response): void {
  const id = req.params['id'] as string;
  if (!documentExists(id)) { res.status(404).json({ error: 'Document not found' }); return; }

  try {
    const { edits } = req.body as {
      edits: Array<{ id: number; narration?: string; debit?: string; credit?: string; balance?: string; date?: string }>;
    };
    const txPath = path.join(getDocumentDir(id), 'transactions.json');
    const txData = JSON.parse(fs.readFileSync(txPath, 'utf-8')) as DocumentTransactions[];
    const editMap = new Map(edits.map(e => [e.id, e]));

    for (const page of txData) {
      for (const tx of page.result.transactions) {
        const edit = editMap.get(tx.id);
        if (!edit) continue;
        if (edit.date      !== undefined) tx.date      = edit.date;
        if (edit.narration !== undefined) tx.narration = edit.narration;
        if (edit.debit     !== undefined) tx.debit     = edit.debit;
        if (edit.credit    !== undefined) tx.credit    = edit.credit;
        if (edit.balance   !== undefined) tx.balance   = edit.balance;
      }
    }

    reconcileTransactions(txData);
    fs.writeFileSync(txPath, JSON.stringify(txData, null, 2));
    res.json(txData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Patch failed';
    res.status(500).json({ error: message });
  }
}

export function reconcileDocumentTransactions(req: Request, res: Response): void {
  const id = req.params['id'] as string;
  if (!documentExists(id)) { res.status(404).json({ error: 'Document not found' }); return; }

  try {
    const txPath = path.join(getDocumentDir(id), 'transactions.json');
    const txData = JSON.parse(fs.readFileSync(txPath, 'utf-8')) as DocumentTransactions[];
    reconcileTransactions(txData);
    fs.writeFileSync(txPath, JSON.stringify(txData, null, 2));
    res.json(txData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconcile failed';
    res.status(500).json({ error: message });
  }
}
