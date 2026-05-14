'use client';

import { useState } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';
import type { DetectedTransaction } from '@/lib/types';

function fmt(val: string): string {
  if (!val) return '—';
  const n = parseFloat(val.replace(/,/g, ''));
  if (isNaN(n)) return val;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SummaryBar({ txs }: { txs: DetectedTransaction[] }) {
  const totalDebit  = txs.reduce((s, t) => s + (parseFloat(t.debit?.replace(/,/g,'')  || '0')), 0);
  const totalCredit = txs.reduce((s, t) => s + (parseFloat(t.credit?.replace(/,/g,'') || '0')), 0);

  // statement period from first/last date
  const dates = txs.map(t => t.date).filter(Boolean).sort();
  const period = dates.length >= 2 ? `${dates[0]} – ${dates[dates.length - 1]}` : '';

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800 bg-gray-900/50 text-[11px] flex-wrap">
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
    </div>
  );
}

interface RowProps {
  tx: DetectedTransaction;
  isSelected: boolean;
  onSelect: () => void;
}

function TxRow({ tx, isSelected, onSelect }: RowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <tr
      onClick={() => { onSelect(); setExpanded(e => !e); }}
      className={`cursor-pointer border-b border-gray-800/60 transition-colors ${
        isSelected ? 'bg-blue-500/8' : 'hover:bg-gray-800/40'
      }`}
    >
      <td className="px-3 py-2 text-[11px] text-gray-400 whitespace-nowrap font-mono">
        {tx.date}
      </td>
      <td className="px-3 py-2 text-[11px] text-gray-300 max-w-0 w-full">
        <div className={expanded ? '' : 'truncate'} title={tx.narration}>
          {tx.narration || <span className="text-gray-700 italic">—</span>}
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
    </tr>
  );
}

export default function TxPanel() {
  const txData = useViewerStore(s => s.txData);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const allTx: DetectedTransaction[] = txData?.flatMap(p => p.result.transactions) ?? [];

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
      <SummaryBar txs={allTx} />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="border-b border-gray-700">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Date</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-full">Narration</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Debit</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Credit</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            {allTx.map(tx => (
              <TxRow
                key={tx.id}
                tx={tx}
                isSelected={selectedId === tx.id}
                onSelect={() => setSelectedId(prev => prev === tx.id ? null : tx.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
