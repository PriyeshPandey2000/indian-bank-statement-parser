'use client';

import { useViewerStore } from '@/lib/store/viewerStore';
import type { DetectedTransaction } from '@/lib/types';

const TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  TRANSACTION:  { fill: 'rgba(34,197,94,0.12)',  stroke: 'rgba(34,197,94,0.8)' },
  CONTINUATION: { fill: 'rgba(34,197,94,0.05)',  stroke: 'rgba(34,197,94,0.35)' },
  HEADER:       { fill: 'rgba(251,191,36,0.12)', stroke: 'rgba(251,191,36,0.8)' },
  OTHER:        { fill: 'transparent',            stroke: 'transparent' },
};

export default function TransactionOverlay() {
  const parsedData = useViewerStore((s) => s.parsedData);
  const currentPage = useViewerStore((s) => s.currentPage);
  const rowData = useViewerStore((s) => s.rowData);
  const txData = useViewerStore((s) => s.txData);
  const showTxOverlay = useViewerStore((s) => s.showTxOverlay);
  const selectedTransaction = useViewerStore((s) => s.selectedTransaction);
  const setSelectedTransaction = useViewerStore((s) => s.setSelectedTransaction);

  if (!parsedData || !txData || !showTxOverlay || !rowData) return null;

  const page = parsedData.pages[currentPage - 1];
  const pageTx = txData.find((p) => p.page === currentPage);
  const pageRows = rowData.find((p) => p.page === currentPage);
  if (!page || !pageTx || !pageRows) return null;

  const rowMap = new Map(pageRows.rows.map((r) => [r.rowId, r]));
  const { classifiedRows, transactions } = pageTx.result;

  // build map: rowId → transaction (for click handling)
  const rowToTx = new Map<number, DetectedTransaction>();
  for (const tx of transactions) {
    for (const rowId of tx.sourceRows) {
      rowToTx.set(rowId, tx);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${page.width} ${page.height}`}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    >
      {classifiedRows.map(({ row: cr, type }) => {
        const row = rowMap.get(cr.rowId);
        if (!row || type === 'OTHER') return null;
        const colors = TYPE_COLORS[type] ?? TYPE_COLORS['OTHER']!;
        const tx = rowToTx.get(cr.rowId);
        const isSelected = tx && selectedTransaction?.id === tx.id;

        return (
          <g
            key={cr.rowId}
            style={{ pointerEvents: 'all', cursor: type === 'TRANSACTION' || type === 'CONTINUATION' ? 'pointer' : 'default' }}
            onClick={() => tx && setSelectedTransaction(tx)}
          >
            <rect
              x={row.x}
              y={row.y}
              width={row.width}
              height={row.height}
              fill={isSelected ? 'rgba(251,191,36,0.2)' : colors.fill}
              stroke={isSelected ? 'rgba(251,191,36,1)' : colors.stroke}
              strokeWidth={isSelected ? 1.5 : 0.75}
            />
            {/* type badge on left */}
            <text
                x={row.x + 1}
                y={row.y + row.height / 2}
                fontSize={Math.min(row.height * 0.55, 5)}
                fill={isSelected ? 'rgba(251,191,36,1)' : colors.stroke}
                dominantBaseline="middle"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {type === 'TRANSACTION' ? 'TX' : type === 'CONTINUATION' ? '↳' : 'HDR'}
              </text>
          </g>
        );
      })}
    </svg>
  );
}
