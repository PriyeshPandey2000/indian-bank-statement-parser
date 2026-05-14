import fs from 'fs';
import path from 'path';
import { getDocumentDir } from '../utils/storage';
import { getParsedJson } from './parseService';
import { reconstructRows, type ReconstructedRow, type RowReconstructionOptions } from '../reconstruction/rowReconstruction';

export interface PageRows {
  page: number;
  rows: ReconstructedRow[];
}

export function runRowReconstruction(
  documentId: string,
  opts: RowReconstructionOptions = {}
): PageRows[] {
  const parsed = getParsedJson(documentId);

  const result: PageRows[] = parsed.pages.map((page) => ({
    page: page.page,
    rows: reconstructRows(page.textItems, opts),
  }));

  // persist so frontend can fetch without recomputing
  const rowsPath = path.join(getDocumentDir(documentId), 'rows.json');
  fs.writeFileSync(rowsPath, JSON.stringify(result, null, 2));

  return result;
}

export function getStoredRows(documentId: string): PageRows[] {
  const rowsPath = path.join(getDocumentDir(documentId), 'rows.json');
  if (!fs.existsSync(rowsPath)) {
    throw new Error(`No rows for document: ${documentId}`);
  }
  return JSON.parse(fs.readFileSync(rowsPath, 'utf-8')) as PageRows[];
}
