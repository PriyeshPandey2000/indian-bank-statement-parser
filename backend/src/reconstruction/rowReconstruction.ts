import type { JsonTextItem } from '@llamaindex/liteparse';

export interface ReconstructedRow {
  rowId: number;
  items: JsonTextItem[];
  // bounding box of the whole row
  x: number;
  y: number;
  width: number;
  height: number;
  // derived text (items joined left-to-right)
  text: string;
}

export interface RowReconstructionOptions {
  // fraction of item height used as Y-overlap tolerance (default 0.6)
  overlapThreshold?: number;
}

/**
 * Group text items into logical rows using Y-center proximity.
 *
 * Two items land in the same row when their vertical centres are within
 * `overlapThreshold * max(h_a, h_b)` of each other.  Items within a row
 * are then sorted left-to-right by X.
 */
export function reconstructRows(
  items: JsonTextItem[],
  opts: RowReconstructionOptions = {}
): ReconstructedRow[] {
  const threshold = opts.overlapThreshold ?? 0.6;

  if (items.length === 0) return [];

  // Sort top-to-bottom, then left-to-right as tiebreak
  const sorted = [...items].sort((a, b) =>
    a.y !== b.y ? a.y - b.y : a.x - b.x
  );

  const yCenter = (item: JsonTextItem) => item.y + item.height / 2;

  const buckets: JsonTextItem[][] = [];
  let currentBucket: JsonTextItem[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    const prev = currentBucket[currentBucket.length - 1]!;
    const tolerance = Math.max(item.height, prev.height) * threshold;

    if (Math.abs(yCenter(item) - yCenter(prev)) <= tolerance) {
      currentBucket.push(item);
    } else {
      buckets.push(currentBucket);
      currentBucket = [item];
    }
  }
  buckets.push(currentBucket);

  return buckets.map((bucket, idx) => {
    // sort each row left-to-right
    const rowItems = bucket.sort((a, b) => a.x - b.x);

    const x = Math.min(...rowItems.map((i) => i.x));
    const y = Math.min(...rowItems.map((i) => i.y));
    const right = Math.max(...rowItems.map((i) => i.x + i.width));
    const bottom = Math.max(...rowItems.map((i) => i.y + i.height));

    return {
      rowId: idx + 1,
      items: rowItems,
      x,
      y,
      width: right - x,
      height: bottom - y,
      text: rowItems.map((i) => i.text).join(' '),
    };
  });
}
