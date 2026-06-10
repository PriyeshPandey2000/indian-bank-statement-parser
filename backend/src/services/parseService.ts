import fs from 'fs';
import path from 'path';
import { getDocumentDir, ensureDocumentDir } from '../utils/storage';
import { classifyPdf, type PdfType } from '../utils/pdfClassifier';
import type { ParseResultJson, ScreenshotResult } from '@llamaindex/liteparse';

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const esmImport = new Function('m', 'return import(m)');

async function getLiteParse() {
  const mod = await esmImport('@llamaindex/liteparse') as typeof import('@llamaindex/liteparse');
  return mod.LiteParse;
}

function readMeta(documentId: string): Record<string, unknown> {
  const metaPath = path.join(getDocumentDir(documentId), 'meta.json');
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
  } catch { return {}; }
}

function readPassword(documentId: string): string | undefined {
  const meta = readMeta(documentId);
  return typeof meta.password === 'string' ? meta.password : undefined;
}

export function readPdfType(documentId: string): PdfType {
  const meta = readMeta(documentId);
  return meta.pdfType === 'scanned' ? 'scanned' : 'digital';
}

export async function runParse(documentId: string): Promise<ParseResultJson> {
  const dir = getDocumentDir(documentId);
  const pdfPath = path.join(dir, 'original.pdf');

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const password = readPassword(documentId);
  const LiteParse = await getLiteParse();

  // 400 DPI: for scanned PDFs this improves OCR date recall from 74%→99.6%.
  // For digital PDFs, LiteParse only OCRs text-sparse regions so high DPI has no effect on them.
  const parser = new LiteParse({ outputFormat: 'json', ocrEnabled: true, dpi: 400, ...(password && { password }) });
  const result = await parser.parse(pdfPath, true);

  if (!result.json) {
    throw new Error('LiteParse returned no JSON output');
  }

  const parsedJsonPath = path.join(dir, 'parsed.json');
  fs.writeFileSync(parsedJsonPath, JSON.stringify(result.json, null, 2));

  const pdfType = classifyPdf(result.json);
  const metaPath = path.join(dir, 'meta.json');
  const existingMeta: Record<string, unknown> = fs.existsSync(metaPath)
    ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>)
    : {};
  fs.writeFileSync(metaPath, JSON.stringify({ ...existingMeta, pdfType }, null, 2));

  return result.json;
}

export async function runScreenshots(documentId: string): Promise<ScreenshotResult[]> {
  const dir = ensureDocumentDir(documentId);
  const pdfPath = path.join(dir, 'original.pdf');

  const password = readPassword(documentId);
  const LiteParse = await getLiteParse();
  const parser = new LiteParse({ dpi: 150, ...(password && { password }) });
  const screenshots = await parser.screenshot(pdfPath, undefined, true);

  for (const shot of screenshots) {
    const filename = `page-${shot.pageNum}.png`;
    fs.writeFileSync(path.join(dir, 'screenshots', filename), shot.imageBuffer);
  }

  return screenshots;
}

export function getParsedJson(documentId: string): ParseResultJson {
  const jsonPath = path.join(getDocumentDir(documentId), 'parsed.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`No parsed data for document: ${documentId}`);
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as ParseResultJson;
}

export function getScreenshotPaths(documentId: string): string[] {
  const screenshotsDir = path.join(getDocumentDir(documentId), 'screenshots');
  if (!fs.existsSync(screenshotsDir)) return [];
  return fs.readdirSync(screenshotsDir)
    .filter(f => f.endsWith('.png'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('page-', '').replace('.png', ''));
      const numB = parseInt(b.replace('page-', '').replace('.png', ''));
      return numA - numB;
    })
    .map(f => path.join(screenshotsDir, f));
}
