'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';
import { detectTransactions, exportCsvUrl } from '@/lib/api';
import type { DetectedTransaction } from '@/lib/types';
import TransactionRow from './TransactionRow';
import { getParseQuality } from './ParseQualityBadge';

type SortKey = 'index' | 'date' | 'debit' | 'credit' | 'balance';
type SortDir = 'asc' | 'desc';

function parseAmount(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

function SortHeader({ label, sortKey, current, dir, onSort, align = 'left' }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; align?: 'left' | 'right';
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors
        ${active ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}
        ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );
}

const BANK_LABELS: Record<string, string> = {
  axis:    'Axis Bank',
  hdfc:    'HDFC Bank',
  kotak:   'Kotak Mahindra',
  generic: 'Generic',
};

function StatsBar({ txs, bankProfileId }: { txs: DetectedTransaction[]; bankProfileId?: string }) {
  const good    = txs.filter(t => getParseQuality(t) === 'good').length;
  const partial = txs.filter(t => getParseQuality(t) === 'partial').length;
  const poor    = txs.filter(t => getParseQuality(t) === 'poor').length;
  const bankLabel = bankProfileId ? (BANK_LABELS[bankProfileId] ?? bankProfileId) : null;

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="text-gray-500">{txs.length} rows</span>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-400">{good}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-yellow-400" />
        <span className="text-gray-400">{partial}</span>
      </div>
      {poor > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-red-400">{poor}</span>
        </div>
      )}
      {bankLabel && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
          bankProfileId === 'generic'
            ? 'bg-gray-700/40 text-gray-500 border-gray-600/40'
            : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
        }`}>
          {bankLabel}
        </span>
      )}
    </div>
  );
}

export default function TransactionTable() {
  const [collapsed, setCollapsed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('index');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const documentId        = useViewerStore(s => s.documentId);
  const txData            = useViewerStore(s => s.txData);
  const txStatus          = useViewerStore(s => s.txStatus);
  const rowStatus         = useViewerStore(s => s.rowStatus);
  const setTxData         = useViewerStore(s => s.setTxData);
  const setTxStatus       = useViewerStore(s => s.setTxStatus);
  const selectedTx        = useViewerStore(s => s.selectedTransaction);
  const setSelectedTx     = useViewerStore(s => s.setSelectedTransaction);
  const showTxOverlay     = useViewerStore(s => s.showTxOverlay);
  const toggleTxOverlay   = useViewerStore(s => s.toggleTxOverlay);

  const allTx: DetectedTransaction[] = txData?.flatMap(p => p.result.transactions) ?? [];
  const bankProfileId = txData?.[0]?.result.bankProfileId;

  // sort
  const sorted = [...allTx].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'date')    cmp = a.date.localeCompare(b.date);
    if (sortKey === 'debit')   cmp = parseAmount(a.debit) - parseAmount(b.debit);
    if (sortKey === 'credit')  cmp = parseAmount(a.credit) - parseAmount(b.credit);
    if (sortKey === 'balance') cmp = parseAmount(a.balance) - parseAmount(b.balance);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const filtered = showSuspiciousOnly ? sorted.filter(t => t.isSuspicious) : sorted;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleDetect = async () => {
    if (!documentId) return;
    setTxStatus('detecting');
    try {
      const result = await detectTransactions(documentId);
      setTxData(result);
      setCollapsed(false);
    } catch { setTxStatus('error'); }
  };

  // keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (collapsed || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx(i => Math.min((i ?? -1) + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx(i => Math.max((i ?? 1) - 1, 0));
    } else if (e.key === 'Enter' && focusedIdx !== null) {
      const tx = filtered[focusedIdx];
      if (tx) setSelectedTx(selectedTx?.id === tx.id ? null : tx);
    } else if (e.key === 'Escape') {
      setSelectedTx(null);
      setFocusedIdx(null);
    }
  }, [collapsed, filtered, focusedIdx, selectedTx, setSelectedTx]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // scroll selected row into view
  useEffect(() => {
    if (!selectedTx) return;
    const el = document.querySelector(`[data-tx-id="${selectedTx.id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedTx]);

  const suspiciousCount = allTx.filter(t => t.isSuspicious).length;

  return (
    <div className="border-t border-gray-800 bg-gray-900 shrink-0 flex flex-col" style={{ maxHeight: collapsed ? 40 : 260 }}>
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-800/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-200 transition-colors"
          >
            Transactions {collapsed ? '▲' : '▼'}
          </button>
          {!collapsed && allTx.length > 0 && <StatsBar txs={allTx} bankProfileId={bankProfileId} />}
        </div>

        <div className="flex items-center gap-3">
          {!collapsed && allTx.length > 0 && (
            <>
              {suspiciousCount > 0 && (
                <button
                  onClick={() => setShowSuspiciousOnly(s => !s)}
                  className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                    showSuspiciousOnly
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                      : 'text-gray-500 hover:text-orange-400'
                  }`}
                >
                  ⚠ {suspiciousCount} suspicious
                </button>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <div
                  onClick={toggleTxOverlay}
                  className={['relative w-6 h-3 rounded-full transition-colors', showTxOverlay ? 'bg-green-600' : 'bg-gray-600'].join(' ')}
                >
                  <div className={['absolute top-0.5 w-2 h-2 rounded-full bg-white transition-transform', showTxOverlay ? 'translate-x-3.5' : 'translate-x-0.5'].join(' ')} />
                </div>
                <span className="text-[11px] text-gray-500">Overlay</span>
              </label>
            </>
          )}

          {allTx.length > 0 && documentId && (
            <a
              href={exportCsvUrl(documentId)}
              download
              className="px-2.5 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors font-medium"
            >
              ↓ CSV
            </a>
          )}

          <button
            onClick={handleDetect}
            disabled={rowStatus !== 'done' || txStatus === 'detecting'}
            className="px-2.5 py-1 text-xs rounded bg-green-800 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors font-medium"
          >
            {txStatus === 'detecting' ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                Detecting…
              </span>
            ) : txData ? 'Re-detect' : 'Detect Transactions'}
          </button>
        </div>
      </div>

      {/* table */}
      {!collapsed && (
        <div
          ref={tableRef}
          tabIndex={0}
          className="overflow-auto flex-1 outline-none focus:ring-1 focus:ring-blue-500/30"
        >
          {allTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="text-gray-600 text-sm">
                {rowStatus !== 'done'
                  ? 'Run "Rows" first in toolbar'
                  : 'Click "Detect Transactions" to start'}
              </div>
              {rowStatus !== 'done' && (
                <div className="text-gray-700 text-xs">Rows → Columns → Detect Transactions</div>
              )}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-900 z-10 shadow-sm">
                <tr className="border-b border-gray-700">
                  <th className="pl-3 pr-1 py-2 w-12 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600">Quality</th>
                  <SortHeader label="Date"    sortKey="date"    current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-full">Description</th>
                  <SortHeader label="Debit"   sortKey="debit"   current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Credit"  sortKey="credit"  current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Balance" sortKey="balance" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <th className="px-2 py-2 w-6" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6 text-gray-600">No suspicious rows found</td></tr>
                )}
                {filtered.map((tx, idx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    index={idx}
                    isSelected={selectedTx?.id === tx.id}
                    isFocused={focusedIdx === idx}
                    onSelect={() => {
                      setFocusedIdx(idx);
                      setSelectedTx(selectedTx?.id === tx.id ? null : tx);
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
