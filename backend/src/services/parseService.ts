import fs from 'fs';
import path from 'path';
import { getDocumentDir, ensureDocumentDir } from '../utils/storage';
import type { ParseResultJson, ScreenshotResult } from '@llamaindex/liteparse';

// LiteParse is ESM-only; CJS backend must use dynamic import
async function getLiteParse() {
  const mod = await import('@llamaindex/liteparse');
  return mod.LiteParse;
}

function readPassword(documentId: string): string | undefined {
  const metaPath = path.join(getDocumentDir(documentId), 'meta.json');
  if (!fs.existsSync(metaPath)) return undefined;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { password?: string };
    return meta.password || undefined;
  } catch { return undefined; }
}

export async function runParse(documentId: string): Promise<ParseResultJson> {
  const dir = getDocumentDir(documentId);
  const pdfPath = path.join(dir, 'original.pdf');

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const password = readPassword(documentId);
  const LiteParse = await getLiteParse();
  const parser = new LiteParse({ outputFormat: 'json', ocrEnabled: true, ...(password && { password }) });
  const result = await parser.parse(pdfPath, true);

  if (!result.json) {
    throw new Error('LiteParse returned no JSON output');
  }

  const parsedJsonPath = path.join(dir, 'parsed.json');
  fs.writeFileSync(parsedJsonPath, JSON.stringify(result.json, null, 2));

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
