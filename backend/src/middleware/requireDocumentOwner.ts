import fs from 'fs';
import path from 'path';
import { Response, NextFunction } from 'express';
import { getDocumentDir } from '../utils/storage';
import { AuthedRequest } from './requireAuth';

interface DocumentMetadata {
  documentId: string;
  filename: string;
  createdAt: string;
  ownerId?: string;
}

// Docs uploaded before ownership tracking was added have no ownerId — grandfathered
// in as accessible rather than locking out pre-existing data.
export function requireDocumentOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  const id = String(req.params.id);
  const metaPath = path.join(getDocumentDir(id), 'metadata.json');

  if (!fs.existsSync(metaPath)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as DocumentMetadata;

  if (metadata.ownerId && metadata.ownerId !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
