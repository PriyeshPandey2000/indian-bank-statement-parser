import { Request, Response } from 'express';
import { saveUploadedPdf } from '../services/uploadService';

export function uploadPdf(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  if (req.file.mimetype !== 'application/pdf') {
    res.status(400).json({ error: 'File must be a PDF' });
    return;
  }

  const password = typeof req.body.password === 'string' && req.body.password ? req.body.password : undefined;
  const documentId = saveUploadedPdf(req.file.buffer, password);
  res.status(201).json({ documentId });
}
