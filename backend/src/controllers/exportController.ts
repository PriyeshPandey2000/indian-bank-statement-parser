import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { getStoredTransactions } from '../services/transactionService';

function escCsv(val: string): string {
  // Prefix formula injection chars so spreadsheet apps don't execute them
  const safe = /^[=+\-@\t\r]/.test(val) ? `'${val}` : val;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportDocumentCsv(req: Request, res: Response): void {
  const id = req.params['id'] as string;

  if (!documentExists(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  try {
    const pages = getStoredTransactions(id);
    const isDirectMode = pages[0]?.result.isDirectMode ?? false;
    const transactions = pages.flatMap((p) => p.result.transactions);

    let header: string[];
    let rows: string[];

    if (isDirectMode) {
      const columns = (pages[0]?.result as any).directColumns as string[] ?? [];
      header = columns.length ? columns : transactions[0]?.rawValues?.map((_, i) => `Col ${i + 1}`) ?? [];
      rows = transactions.map((tx) => (tx.rawValues ?? []).map(escCsv).join(','));
    } else {
      header = ['Date', 'Narration', 'Debit', 'Credit', 'Balance'];
      rows = transactions.map((tx) => [tx.date, tx.narration, tx.debit, tx.credit, tx.balance].map(escCsv).join(','));
    }

    const csv = [header.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${id.slice(0, 8)}.csv"`);
    res.send(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    res.status(500).json({ error: message });
  }
}
