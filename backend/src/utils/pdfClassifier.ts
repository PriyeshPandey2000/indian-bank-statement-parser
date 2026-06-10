import type { ParseResultJson } from '@llamaindex/liteparse';

export type PdfType = 'digital' | 'scanned';

export function classifyPdf(parsedJson: ParseResultJson): PdfType {
  const allItems = parsedJson.pages.flatMap(p => p.textItems);

  if (allItems.length === 0) return 'scanned';

  // Primary signal: LiteParse sets fontName='OCR' on all OCR-detected text
  const ocrCount = allItems.filter(item => item.fontName === 'OCR').length;
  const ocrRatio = ocrCount / allItems.length;

  if (ocrRatio > 0.5) return 'scanned';

  // Secondary: OCR confidence is always < 1.0; native PDF text is undefined or 1.0
  const itemsWithConfidence = allItems.filter(
    item => item.confidence !== undefined && item.confidence !== null,
  );
  if (itemsWithConfidence.length > 0) {
    const coverageRatio = itemsWithConfidence.length / allItems.length;
    const avgConfidence =
      itemsWithConfidence.reduce((s, i) => s + i.confidence!, 0) /
      itemsWithConfidence.length;
    // Only use confidence signal if it covers a meaningful portion of items
    if (coverageRatio > 0.3 && avgConfidence < 0.85) return 'scanned';
  }

  return 'digital';
}
