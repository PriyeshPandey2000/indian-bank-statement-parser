import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ensureDocumentDir, getDocumentDir } from '../utils/storage';

export function saveUploadedPdf(fileBuffer: Buffer, password?: string): string {
  const documentId = uuidv4();
  const dir = ensureDocumentDir(documentId);
  fs.writeFileSync(path.join(dir, 'original.pdf'), fileBuffer);
  if (password) {
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ password }));
  }
  return documentId;
}

export function getOriginalPdfPath(documentId: string): string {
  return path.join(getDocumentDir(documentId), 'original.pdf');
}

export function documentExists(documentId: string): boolean {
  const pdfPath = getOriginalPdfPath(documentId);
  return fs.existsSync(pdfPath);
}
