import fs from 'fs';
import path from 'path';
import os from 'os';
import { Request, Response } from 'express';
import { saveUploadedPdf } from '../services/uploadService';
import { decryptPdf } from '../services/pdfDecryptService';
import { getDocumentDir } from '../utils/storage';

function countPdfPages(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return Math.max(matches?.length ?? 1, 1);
}

async function checkLicense(pages: number): Promise<{ allowed: boolean; reason?: string; pagesUsed?: number; pagesLimit?: number }> {
  const url = process.env['LICENSE_URL'];
  const token = process.env['LICENSE_TOKEN'];
  if (!url || !token) return { allowed: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pages }),
      signal: controller.signal,
    });
    if (res.status >= 500) return { allowed: true }; // server error → fail open
    const data = await res.json() as { allowed: boolean; reason?: string; pagesUsed?: number; pagesLimit?: number };
    return data;
  } catch {
    return { allowed: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadPdf(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    console.error('[upload] no file in request. content-type:', req.headers['content-type'], 'body keys:', Object.keys(req.body || {}), 'files:', req.files);
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  if (req.file.mimetype !== 'application/pdf') {
    console.error('[upload] wrong mimetype:', req.file.mimetype);
    res.status(400).json({ error: 'File must be a PDF' });
    return;
  }

  const pages = countPdfPages(req.file.buffer);
  const license = await checkLicense(pages);
  if (!license.allowed) {
    res.status(402).json({
      error: license.reason === 'limit_reached' ? 'Page limit reached. Contact Priyesh to continue.' : 'Access denied. Contact Priyesh to activate your license.',
      reason: license.reason,
      pagesUsed: license.pagesUsed,
      pagesLimit: license.pagesLimit,
    });
    return;
  }

  const password = typeof req.body.password === 'string' && req.body.password ? req.body.password : undefined;

  let pdfBuffer = req.file.buffer;
  if (password) {
    // Write to tmp, decrypt with qpdf, read back
    const tmpIn = path.join(os.tmpdir(), `upload-${Date.now()}.pdf`);
    try {
      fs.writeFileSync(tmpIn, pdfBuffer);
      pdfBuffer = await decryptPdf(tmpIn, password);
    } catch (err) {
      console.error('[upload] qpdf decrypt failed:', err);
      res.status(400).json({ error: 'Incorrect password or unsupported encryption.' });
      return;
    } finally {
      fs.rmSync(tmpIn, { force: true });
    }
  }

  const documentId = saveUploadedPdf(pdfBuffer);

  fs.writeFileSync(
    path.join(getDocumentDir(documentId), 'metadata.json'),
    JSON.stringify({ documentId, filename: req.file.originalname, createdAt: new Date().toISOString() })
  );

  res.status(201).json({ documentId, pagesUsed: license.pagesUsed, pagesLimit: license.pagesLimit });
}
