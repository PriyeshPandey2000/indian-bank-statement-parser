'use client';

import { useViewerStore } from '@/lib/store/viewerStore';

function InfoRow({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex justify-between gap-2 py-1 border-b border-gray-800 last:border-0">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className="text-gray-200 text-xs font-mono text-right break-all">{String(value)}</span>
    </div>
  );
}

function SectionHeader({ title, onClear }: { title: string; onClear?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</div>
      {onClear && (
        <button onClick={onClear} className="text-gray-600 hover:text-gray-300 text-xs transition-colors">
          Clear
        </button>
      )}
    </div>
  );
}

export default function DebugSidebar() {
  const parsedData = useViewerStore((s) => s.parsedData);
  const currentPage = useViewerStore((s) => s.currentPage);
  const selectedItem = useViewerStore((s) => s.selectedItem);
  const hoveredItem = useViewerStore((s) => s.hoveredItem);
  const setSelectedItem = useViewerStore((s) => s.setSelectedItem);
  const columnData = useViewerStore((s) => s.columnData);
  const selectedRow = useViewerStore((s) => s.selectedRow);
  const setSelectedRow = useViewerStore((s) => s.setSelectedRow);
  const rowData = useViewerStore((s) => s.rowData);
  const selectedTransaction = useViewerStore((s) => s.selectedTransaction);
  const setSelectedTransaction = useViewerStore((s) => s.setSelectedTransaction);

  const page = parsedData?.pages[currentPage - 1];
  const activeItem = selectedItem ?? hoveredItem;
  const pageRows = rowData?.find((p) => p.page === currentPage);

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden shrink-0">
      {/* page info */}
      <div className="p-3 border-b border-gray-800">
        <SectionHeader title="Page Info" />
        {page ? (
          <>
            <InfoRow label="Dimensions" value={`${page.width.toFixed(0)} × ${page.height.toFixed(0)} pt`} />
            <InfoRow label="Text Items" value={page.textItems.length} />
            <InfoRow label="Rows" value={pageRows ? pageRows.rows.length : '—'} />
            <InfoRow label="Columns" value={columnData?.find(p => p.page === currentPage)?.columns.columns.length ?? '—'} />
            <InfoRow label="Page #" value={page.page} />
          </>
        ) : (
          <div className="text-gray-600 text-xs">No data</div>
        )}
      </div>

      {/* selected row */}
      {selectedRow && (
        <div className="p-3 border-b border-gray-800">
          <SectionHeader title={`Row ${selectedRow.rowId}`} onClear={() => setSelectedRow(null)} />
          <div className="bg-gray-800 rounded p-2 mb-2">
            <div className="text-white text-xs font-mono break-all line-clamp-3">{selectedRow.text}</div>
          </div>
          <InfoRow label="Items" value={selectedRow.items.length} />
          <InfoRow label="x" value={selectedRow.x.toFixed(1)} />
          <InfoRow label="y" value={selectedRow.y.toFixed(1)} />
          <InfoRow label="width" value={selectedRow.width.toFixed(1)} />
          <InfoRow label="height" value={selectedRow.height.toFixed(1)} />
        </div>
      )}

      {/* selected transaction */}
      {selectedTransaction && (
        <div className="p-3 border-b border-gray-800">
          <SectionHeader title={`TX #${selectedTransaction.id}`} onClear={() => setSelectedTransaction(null)} />
          <InfoRow label="Date" value={selectedTransaction.date || '—'} />
          <div className="py-1 border-b border-gray-800">
            <div className="text-gray-500 text-xs mb-1">Narration</div>
            <div className="text-gray-200 text-xs font-mono break-all">{selectedTransaction.narration}</div>
          </div>
          <InfoRow label="Debit"   value={selectedTransaction.debit   || '—'} />
          <InfoRow label="Credit"  value={selectedTransaction.credit  || '—'} />
          <InfoRow label="Balance" value={selectedTransaction.balance || '—'} />
          <InfoRow label="Rows"    value={selectedTransaction.sourceRows.join(', ')} />
          {selectedTransaction.isSuspicious && (
            <div className="mt-1 text-orange-400 text-xs">⚠ Suspicious — check manually</div>
          )}
        </div>
      )}

      {/* item inspector */}
      <div className="p-3 flex-1 overflow-auto">
        <SectionHeader
          title={selectedItem ? 'Selected Item' : hoveredItem ? 'Hovered Item' : 'Item Inspector'}
          onClear={selectedItem ? () => setSelectedItem(null) : undefined}
        />

        {activeItem ? (
          <div>
            <div className="bg-gray-800 rounded p-2 mb-3">
              <div className="text-white text-sm font-mono break-all">{activeItem.text}</div>
            </div>
            <InfoRow label="x" value={activeItem.x.toFixed(2)} />
            <InfoRow label="y" value={activeItem.y.toFixed(2)} />
            <InfoRow label="width" value={activeItem.width.toFixed(2)} />
            <InfoRow label="height" value={activeItem.height.toFixed(2)} />
            <InfoRow label="font" value={activeItem.fontName} />
            <InfoRow label="fontSize" value={activeItem.fontSize ? `${activeItem.fontSize.toFixed(1)}pt` : undefined} />
            <InfoRow label="confidence" value={activeItem.confidence !== undefined ? activeItem.confidence.toFixed(3) : undefined} />
          </div>
        ) : (
          <div className="text-gray-600 text-xs">Hover or click a bounding box</div>
        )}
      </div>
    </div>
  );
}
