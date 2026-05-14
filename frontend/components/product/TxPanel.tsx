'use client';

import { useState, useCallback } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';
import { patchTransactions, reconcile, exportCsvUrl } from '@/lib/api';
import type { DetectedTransaction } from '@/lib/types';

function fmt(val: string): string {
  if (!val) return '—';
  const n = parseFloat(val.replace(/,/g, ''));
  if (isNaN(n)) return val;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAmt(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

// ── Reconciliation summary bar ─────────────────────────────────────────────

function ReconciliationBar({
  txs,
  suspiciousCount,
  showSuspiciousOnly,
  onToggleSuspicious,
  onRecheck,
  rechecking,
  documentId,
}: {
  txs: DetectedTransaction[];
  suspiciousCount: number;
  showSuspiciousOnly: boolean;
  onToggleSuspicious: () => void;
  onRecheck: () => void;
  rechecking: boolean;
  documentId: string;
}) {
  const totalDebit  = txs.reduce((s, t) => s + parseAmt(t.debit), 0);
  const totalCredit = txs.reduce((s, t) => s + parseAmt(t.credit), 0);
  const dates = txs.map(t => t.date).filter(Boolean).sort();
  const period = dates.length >= 2 ? `${dates[0]} – ${dates[dates.length - 1]}` : '';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50 text-[11px] shrink-0 flex-wrap gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-gray-500">{txs.length} transactions</span>
        {period && <span className="text-gray-600">{period}</span>}
        {totalDebit > 0 && (
          <span className="text-red-400">
            ↓ {totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        )}
        {totalCredit > 0 && (
          <span className="text-green-400">
            ↑ {totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        )}
        {suspiciousCount > 0 ? (
          <button
            onClick={onToggleSuspicious}
            className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${
              showSuspiciousOnly
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                : 'bg-transparent text-orange-400/70 border-orange-500/30 hover:border-orange-500/60'
            }`}
          >
            ⚠ {suspiciousCount} suspicious {showSuspiciousOnly ? '(showing)' : ''}
          </button>
        ) : (
          <span className="text-green-500/60 text-[10px]">✓ reconciled</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRecheck}
          disabled={rechecking}
          title="Re-run balance reconciliation on current data"
          className="px-2 py-1 text-[11px] rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 transition-colors"
        >
          {rechecking ? '…' : '↻ Re-check'}
        </button>
        <a
          href={exportCsvUrl(documentId)}
          download
          className="px-2 py-1 text-[11px] rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
        >
          ↓ CSV
        </a>
      </div>
    </div>
  );
}

// ── Inline-editable row ────────────────────────────────────────────────────

type EditDraft = Pick<DetectedTransaction, 'date' | 'narration' | 'debit' | 'credit' | 'balance'>;

interface RowProps {
  tx: DetectedTransaction;
  isSelected: boolean;
  onSelect: () => void;
  onJumpToPdf: () => void;
  onSave: (id: number, draft: EditDraft) => Promise<void>;
}

function TxRow({ tx, isSelected, onSelect, onJumpToPdf, onSave }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [draft, setDraft]       = useState<EditDraft>({
    date: tx.date, narration: tx.narration,
    debit: tx.debit, credit: tx.credit, balance: tx.balance,
  });

  const rowBg = tx.isSuspicious
    ? 'border-l-2 border-l-orange-500/80 bg-orange-500/5'
    : isSelected
    ? 'bg-blue-500/8 border-l-2 border-l-blue-500/60'
    : 'hover:bg-gray-800/40';

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(tx.id, draft); setEditing(false); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    setDraft({ date: tx.date, narration: tx.narration, debit: tx.debit, credit: tx.credit, balance: tx.balance });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b border-gray-700 bg-gray-800/60">
        <td className="px-2 py-1.5">
          <input
            value={draft.date}
            onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
            className="w-24 bg-gray-700 text-gray-200 text-xs font-mono px-1.5 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none"
          />
        </td>
        <td className="px-2 py-1.5 w-full">
          <input
            value={draft.narration}
            onChange={e => setDraft(d => ({ ...d, narration: e.target.value }))}
            className="w-full bg-gray-700 text-gray-200 text-xs px-1.5 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none"
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            value={draft.debit}
            onChange={e => setDraft(d => ({ ...d, debit: e.target.value }))}
            className="w-20 bg-gray-700 text-red-300 text-xs font-mono px-1.5 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none text-right"
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            value={draft.credit}
            onChange={e => setDraft(d => ({ ...d, credit: e.target.value }))}
            className="w-20 bg-gray-700 text-green-300 text-xs font-mono px-1.5 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none text-right"
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            value={draft.balance}
            onChange={e => setDraft(d => ({ ...d, balance: e.target.value }))}
            className="w-24 bg-gray-700 text-gray-200 text-xs font-mono px-1.5 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none text-right"
          />
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2 py-0.5 text-[10px] rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={handleCancel} className="px-2 py-0.5 text-[10px] rounded bg-gray-600 hover:bg-gray-500 text-gray-200">
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr
        onClick={() => { onSelect(); onJumpToPdf(); }}
        onDoubleClick={() => setExpanded(e => !e)}
        className={`cursor-pointer border-b border-gray-800/60 transition-colors group ${rowBg}`}
      >
        <td className="px-3 py-2 text-[11px] text-gray-400 whitespace-nowrap font-mono">
          {tx.date || <span className="text-red-500/70 italic">no date</span>}
        </td>
        <td className="px-3 py-2 text-[11px] text-gray-300 max-w-0 w-full">
          <div className="flex items-center gap-2">
            <span className="truncate" title={tx.narration}>
              {tx.narration || <span className="text-gray-600 italic">—</span>}
            </span>
            {tx.isSuspicious && (
              <span className="shrink-0 text-[10px] text-orange-400/80" title={tx.suspiciousReason}>⚠</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-[11px] text-red-400 text-right whitespace-nowrap font-mono">
          {tx.debit ? fmt(tx.debit) : ''}
        </td>
        <td className="px-3 py-2 text-[11px] text-green-400 text-right whitespace-nowrap font-mono">
          {tx.credit ? fmt(tx.credit) : ''}
        </td>
        <td className="px-3 py-2 text-[11px] text-gray-400 text-right whitespace-nowrap font-mono">
          {tx.balance ? fmt(tx.balance) : '—'}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="text-[10px] text-gray-500 hover:text-blue-400 px-1 transition-colors"
              title="Edit row"
            >✎</button>
            <button
              onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className="text-[10px] text-gray-600 hover:text-gray-300 px-1 transition-colors"
            >{expanded ? '▲' : '▼'}</button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className={`border-b border-gray-700/60 ${tx.isSuspicious ? 'border-l-2 border-l-orange-500/50' : ''}`}>
          <td colSpan={6} className="px-4 py-3 bg-gray-900/60 text-xs">
            <div className="space-y-1.5">
              {tx.isSuspicious && tx.suspiciousReason && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded px-3 py-2 text-orange-300 text-[11px]">
                  ⚠ {tx.suspiciousReason}
                </div>
              )}
              <div className="text-gray-500 text-[10px] uppercase tracking-wider">Raw PDF text</div>
              <div className="text-gray-400 font-mono bg-gray-800/50 rounded px-2 py-1.5 break-all text-[11px] leading-relaxed">
                {tx.rawText}
              </div>
              <div className="text-gray-600 text-[10px]">Source rows: {tx.sourceRows.join(', ')}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function TxPanel() {
  const txData             = useViewerStore(s => s.txData);
  const setTxData          = useViewerStore(s => s.setTxData);
  const documentId         = useViewerStore(s => s.documentId);
  const setScrollTargetPage = useViewerStore(s => s.setScrollTargetPage);

  const [selectedId, setSelectedId]           = useState<number | null>(null);
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false);
  const [rechecking, setRechecking]           = useState(false);

  const allTx: DetectedTransaction[] = txData?.flatMap(p => p.result.transactions) ?? [];
  const suspiciousCount = allTx.filter(t => t.isSuspicious).length;
  const displayed = showSuspiciousOnly ? allTx.filter(t => t.isSuspicious) : allTx;

  // Find which page a transaction belongs to
  const txPageMap = new Map<number, number>();
  if (txData) {
    for (const p of txData) {
      for (const t of p.result.transactions) txPageMap.set(t.id, p.page);
    }
  }

  const handleJumpToPdf = useCallback((txId: number) => {
    const page = txPageMap.get(txId);
    if (page !== undefined) setScrollTargetPage(page);
  }, [txPageMap, setScrollTargetPage]);

  const handleSave = useCallback(async (id: number, draft: EditDraft) => {
    if (!documentId) return;
    const updated = await patchTransactions(documentId, [{ id, ...draft }]);
    setTxData(updated);
  }, [documentId, setTxData]);

  const handleRecheck = useCallback(async () => {
    if (!documentId) return;
    setRechecking(true);
    try { setTxData(await reconcile(documentId)); }
    finally { setRechecking(false); }
  }, [documentId, setTxData]);

  if (allTx.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-700">
        <div className="text-sm">No transactions yet</div>
        <div className="text-xs">Click Process to start</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ReconciliationBar
        txs={allTx}
        suspiciousCount={suspiciousCount}
        showSuspiciousOnly={showSuspiciousOnly}
        onToggleSuspicious={() => setShowSuspiciousOnly(s => !s)}
        onRecheck={handleRecheck}
        rechecking={rechecking}
        documentId={documentId ?? ''}
      />

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="border-b border-gray-700">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Date</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-full">Narration</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Debit</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Credit</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Balance</th>
              <th className="px-2 py-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {displayed.map(tx => (
              <TxRow
                key={tx.id}
                tx={tx}
                isSelected={selectedId === tx.id}
                onSelect={() => setSelectedId(prev => prev === tx.id ? null : tx.id)}
                onJumpToPdf={() => handleJumpToPdf(tx.id)}
                onSave={handleSave}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
