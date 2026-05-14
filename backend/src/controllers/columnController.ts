import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { runColumnDetection, getStoredColumns } from '../services/columnService';

export function detectDocumentColumns(req: Request, res: Response): void {
  const id = req.params['id'] as string;

  if (!documentExists(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  try {
    const result = runColumnDetection(id);
    res.json({ documentId: id, pages: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Column detection failed';
    res.status(500).json({ error: message });
  }
}

export function getDocumentColumns(req: Request, res: Response): void {
  const id = req.params['id'] as string;
  try {
    const result = getStoredColumns(id);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not found';
    res.status(404).json({ error: message });
  }
}
