import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { runRowReconstruction, getStoredRows } from '../services/rowService';

export function reconstructDocumentRows(req: Request, res: Response): void {
  const id = req.params['id'] as string;

  if (!documentExists(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const overlapThreshold = req.query['threshold']
    ? parseFloat(req.query['threshold'] as string)
    : undefined;

  try {
    const result = runRowReconstruction(id, { overlapThreshold });
    const totalRows = result.reduce((sum, p) => sum + p.rows.length, 0);
    res.json({ documentId: id, pages: result.length, totalRows, rows: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Row reconstruction failed';
    res.status(500).json({ error: message });
  }
}

export function getDocumentRows(req: Request, res: Response): void {
  const id = req.params['id'] as string;

  try {
    const rows = getStoredRows(id);
    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not found';
    res.status(404).json({ error: message });
  }
}
