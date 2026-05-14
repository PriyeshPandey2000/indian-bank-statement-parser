import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { getStoredTransactions } from '../services/transactionService';

function escCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportDocumentCsv(req: Request, res: Response): void {
  const id = req.params['id'] as string;

  if (!documentExists(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  try {
    const pages = getStoredTransactions(id);
    const transactions = pages.flatMap((p) => p.result.transactions);

    const header = ['Date', 'Narration', 'Debit', 'Credit', 'Balance'];
    const rows = transactions.map((tx) => [
      tx.date,
      tx.narration,
      tx.debit,
      tx.credit,
      tx.balance,
    ].map(escCsv).join(','));

    const csv = [header.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${id.slice(0, 8)}.csv"`);
    res.send(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    res.status(500).json({ error: message });
  }
}
