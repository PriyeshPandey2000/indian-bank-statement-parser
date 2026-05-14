'use client';

import { useViewerStore } from '@/lib/store/viewerStore';
import { reconstructRows, detectColumns, getTransactions } from '@/lib/api';

function Toggle({ label, value, onToggle, color = 'bg-blue-500' }: {
  label: string;
  value: boolean;
  onToggle: () => void;
  color?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <div
        onClick={onToggle}
        className={['relative w-7 h-3.5 rounded-full transition-colors', value ? color : 'bg-gray-600'].join(' ')}
      >
        <div className={['absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform', value ? 'translate-x-3.5' : 'translate-x-0.5'].join(' ')} />
      </div>
      <span className="text-xs text-gray-300">{label}</span>
    </label>
  );
}

function ActionBtn({ onClick, disabled, loading, label, loadingLabel, color = 'bg-blue-600 hover:bg-blue-500' }: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  label: string;
  loadingLabel: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-2 py-1 text-xs rounded ${color} disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors`}
    >
      {loading ? (
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin inline-block" />
          {loadingLabel}
        </span>
      ) : label}
    </button>
  );
}

export default function OverlayControls() {
  const documentId = useViewerStore((s) => s.documentId);
  const parseStatus = useViewerStore((s) => s.parseStatus);

  // bbox
  const showBBoxOverlay = useViewerStore((s) => s.showBBoxOverlay);
  const toggleBBoxOverlay = useViewerStore((s) => s.toggleBBoxOverlay);

  // rows
  const showRowOverlay = useViewerStore((s) => s.showRowOverlay);
  const toggleRowOverlay = useViewerStore((s) => s.toggleRowOverlay);
  const rowStatus = useViewerStore((s) => s.rowStatus);
  const rowOverlapThreshold = useViewerStore((s) => s.rowOverlapThreshold);
  const setRowOverlapThreshold = useViewerStore((s) => s.setRowOverlapThreshold);
  const setRowData = useViewerStore((s) => s.setRowData);
  const setRowStatus = useViewerStore((s) => s.setRowStatus);

  // columns
  const showColumnOverlay = useViewerStore((s) => s.showColumnOverlay);
  const toggleColumnOverlay = useViewerStore((s) => s.toggleColumnOverlay);
  const columnStatus = useViewerStore((s) => s.columnStatus);
  const setColumnData = useViewerStore((s) => s.setColumnData);
  const setColumnStatus = useViewerStore((s) => s.setColumnStatus);
  const setTxData = useViewerStore((s) => s.setTxData);

  const handleReconstructRows = async () => {
    if (!documentId) return;
    setRowStatus('reconstructing');
    try {
      const rows = await reconstructRows(documentId, rowOverlapThreshold);
      setRowData(rows);
      if (!showRowOverlay) toggleRowOverlay();
    } catch { setRowStatus('error'); }
  };

  const handleDetectColumns = async () => {
    if (!documentId) return;
    setColumnStatus('detecting');
    try {
      const cols = await detectColumns(documentId);
      setColumnData(cols);
      // column detection also fills amounts in transactions — refresh them
      try {
        const txRefresh = await getTransactions(documentId);
        setTxData(txRefresh);
      } catch { /* transactions may not exist yet */ }
      if (!showColumnOverlay) toggleColumnOverlay();
    } catch { setColumnStatus('error'); }
  };

  return (
    <div className="flex items-center gap-3">
      <Toggle label="Boxes" value={showBBoxOverlay} onToggle={toggleBBoxOverlay} color="bg-blue-500" />

      <div className="w-px h-4 bg-gray-700" />

      <Toggle label="Rows" value={showRowOverlay} onToggle={toggleRowOverlay} color="bg-purple-500" />

      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-600">thr</span>
        <input
          type="range" min={0.2} max={1.0} step={0.05}
          value={rowOverlapThreshold}
          onChange={(e) => setRowOverlapThreshold(parseFloat(e.target.value))}
          className="w-14 accent-purple-500"
          title={`Threshold: ${rowOverlapThreshold}`}
        />
        <span className="text-xs text-gray-500 w-5">{rowOverlapThreshold.toFixed(1)}</span>
      </div>

      <ActionBtn
        onClick={handleReconstructRows}
        disabled={parseStatus !== 'done'}
        loading={rowStatus === 'reconstructing'}
        label="Rows"
        loadingLabel="Rows…"
        color="bg-purple-700 hover:bg-purple-600"
      />

      <div className="w-px h-4 bg-gray-700" />

      <Toggle label="Cols" value={showColumnOverlay} onToggle={toggleColumnOverlay} color="bg-yellow-500" />

      <ActionBtn
        onClick={handleDetectColumns}
        disabled={rowStatus !== 'done'}
        loading={columnStatus === 'detecting'}
        label="Columns"
        loadingLabel="Cols…"
        color="bg-yellow-700 hover:bg-yellow-600"
      />

      {columnStatus === 'done' && <span className="text-xs text-yellow-400">✓</span>}
    </div>
  );
}
