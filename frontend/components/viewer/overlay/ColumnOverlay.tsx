'use client';

import { useViewerStore } from '@/lib/store/viewerStore';
import type { ColumnType } from '@/lib/types';

const COL_COLORS: Record<ColumnType, string> = {
  DATE:      '#60a5fa', // blue
  CHQ:       '#a78bfa', // purple
  NARRATION: '#34d399', // green
  DEBIT:     '#f87171', // red
  CREDIT:    '#4ade80', // bright green
  BALANCE:   '#facc15', // yellow
  UNKNOWN:   '#6b7280', // gray
};

export default function ColumnOverlay() {
  const parsedData = useViewerStore((s) => s.parsedData);
  const currentPage = useViewerStore((s) => s.currentPage);
  const columnData = useViewerStore((s) => s.columnData);
  const showColumnOverlay = useViewerStore((s) => s.showColumnOverlay);

  if (!parsedData || !columnData || !showColumnOverlay) return null;

  const page = parsedData.pages[currentPage - 1];
  const pageCol = columnData.find((p) => p.page === currentPage);
  if (!page || !pageCol || pageCol.columns.columns.length === 0) return null;

  const { columns } = pageCol.columns;

  return (
    <svg
      viewBox={`0 0 ${page.width} ${page.height}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {columns.map((col) => {
        const color = COL_COLORS[col.type];
        return (
          <g key={`${col.type}-${col.xStart}`}>
            {/* left boundary vertical guide */}
            {col.xStart > 0 && (
              <line
                x1={col.xStart} y1={0}
                x2={col.xStart} y2={page.height}
                stroke={color}
                strokeWidth={0.5}
                strokeDasharray="3 3"
                opacity={0.6}
              />
            )}
            {/* column label at top */}
            <rect
              x={col.xStart + 1}
              y={2}
              width={Math.min(col.xEnd - col.xStart - 2, col.label.length * 3.5 + 4)}
              height={7}
              fill={color}
              opacity={0.15}
              rx={1}
            />
            <text
              x={col.xStart + 3}
              y={7.5}
              fontSize={4.5}
              fill={color}
              opacity={0.9}
              style={{ userSelect: 'none' }}
            >
              {col.type}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
