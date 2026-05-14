import { Request, Response } from 'express';
import { documentExists } from '../services/uploadService';
import { runParse, runScreenshots, getParsedJson, getScreenshotPaths } from '../services/parseService';

export async function parseDocument(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;

  if (!documentExists(id)) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  try {
    const [parsedJson, screenshots] = await Promise.all([
      runParse(id),
      runScreenshots(id),
    ]);

    res.json({
      documentId: id,
      pageCount: parsedJson.pages.length,
      screenshotCount: screenshots.length,
      status: 'parsed',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    res.status(500).json({ error: message });
  }
}

export function getParseResult(req: Request, res: Response): void {
  const id = req.params['id'] as string;

  try {
    const json = getParsedJson(id);
    res.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not found';
    res.status(404).json({ error: message });
  }
}

export function getScreenshot(req: Request, res: Response): void {
  const id = req.params['id'] as string;
  const page = req.params['page'] as string;
  const paths = getScreenshotPaths(id);
  const pageNum = parseInt(page ?? '1');
  const imgPath = paths.find(p => p.includes(`page-${pageNum}.png`));

  if (!imgPath) {
    res.status(404).json({ error: `Screenshot for page ${pageNum} not found` });
    return;
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(imgPath);
}
