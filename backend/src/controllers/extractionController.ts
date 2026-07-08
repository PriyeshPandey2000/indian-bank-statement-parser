import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { runExtraction } from '../services/extractionService';

export async function extractTransactions(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;

  if (!documentExists(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  try {
    const result = await runExtraction(id);
    const total = result.reduce((s, p) => s + p.result.transactions.length, 0);
    const suspicious = result.reduce((s, p) => s + p.result.transactions.filter(t => t.isSuspicious).length, 0);
    res.json({ documentId: id, totalTransactions: total, suspiciousCount: suspicious, pages: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    res.status(500).json({ error: message });
  }
}
