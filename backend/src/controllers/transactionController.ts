import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { runTransactionDetection, getStoredTransactions } from '../services/transactionService';

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
