'use client';

import { useViewerStore } from '@/lib/store/viewerStore';
import type { ReconstructedRow } from '@/lib/types';

// distinct hues so adjacent rows are visually separated
const ROW_COLORS = [
  'rgba(239,68,68,0.15)',   // red
  'rgba(249,115,22,0.15)',  // orange
  'rgba(234,179,8,0.15)',   // yellow
  'rgba(34,197,94,0.15)',   // green
  'rgba(6,182,212,0.15)',   // cyan
  'rgba(139,92,246,0.15)',  // purple
];

const ROW_STROKE_COLORS = [
  'rgba(239,68,68,0.7)',
  'rgba(249,115,22,0.7)',
  'rgba(234,179,8,0.7)',
  'rgba(34,197,94,0.7)',
  'rgba(6,182,212,0.7)',
  'rgba(139,92,246,0.7)',
];

export default function RowOverlay() {
  const parsedData = useViewerStore((s) => s.parsedData);
  const currentPage = useViewerStore((s) => s.currentPage);
  const rowData = useViewerStore((s) => s.rowData);
  const showRowOverlay = useViewerStore((s) => s.showRowOverlay);
  const selectedRow = useViewerStore((s) => s.selectedRow);
  const setSelectedRow = useViewerStore((s) => s.setSelectedRow);

  if (!parsedData || !rowData || !showRowOverlay) return null;

  const page = parsedData.pages[currentPage - 1];
  const pageRows = rowData.find((p) => p.page === currentPage);
  if (!page || !pageRows) return null;

  const handleClick = (row: ReconstructedRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRow(row);
  };

  return (
    <svg
      viewBox={`0 0 ${page.width} ${page.height}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ pointerEvents: 'none' }}
    >
      {pageRows.rows.map((row) => {
        const colorIdx = (row.rowId - 1) % ROW_COLORS.length;
        const isSelected = selectedRow?.rowId === row.rowId;

        return (
          <g
            key={row.rowId}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onClick={(e) => handleClick(row, e)}
          >
            <rect
              x={row.x}
              y={row.y}
              width={row.width}
              height={row.height}
              fill={isSelected ? 'rgba(234,179,8,0.3)' : ROW_COLORS[colorIdx]}
              stroke={isSelected ? 'rgb(234,179,8)' : ROW_STROKE_COLORS[colorIdx]}
              strokeWidth={isSelected ? 1.5 : 0.75}
            />
            {/* row id label on left edge */}
            <text
              x={row.x - 1}
              y={row.y + row.height / 2}
              fontSize={Math.min(row.height * 0.7, 6)}
              fill={isSelected ? 'rgb(234,179,8)' : ROW_STROKE_COLORS[colorIdx]}
              textAnchor="end"
              dominantBaseline="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {row.rowId}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
