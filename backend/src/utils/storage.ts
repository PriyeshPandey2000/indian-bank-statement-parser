import path from 'path';
import fs from 'fs';

const STORAGE_ROOT = path.resolve(__dirname, '../../storage');

export function getDocumentDir(documentId: string): string {
  return path.join(STORAGE_ROOT, documentId);
}

export function ensureDocumentDir(documentId: string): string {
  const dir = getDocumentDir(documentId);
  fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
  return dir;
}
