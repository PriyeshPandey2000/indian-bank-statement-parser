'use client';

import { useState } from 'react';
import type { DetectedTransaction } from '@/lib/types';
import ParseQualityBadge from './ParseQualityBadge';
import { useViewerStore } from '@/lib/store/viewerStore';

function AmountCell({ value, color }: { value: string; color: string }) {
  if (!value) return <td className="px-3 py-2 text-right"><span className="text-gray-700 text-xs">·</span></td>;
  return (
    <td className={`px-3 py-2 text-right text-xs font-mono tabular-nums ${color}`}>
      {value}
    </td>
  );
}

interface Props {
  tx: DetectedTransaction;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
}

export default function TransactionRow({ tx, index, isSelected, isFocused, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const setSelectedTransaction = useViewerStore((s) => s.setSelectedTransaction);

  const rowBg = tx.isSuspicious
    ? 'border-l-2 border-l-orange-500 bg-orange-500/5'
    : isSelected
    ? 'bg-yellow-500/8 border-l-2 border-l-yellow-500'
    : isFocused
    ? 'bg-gray-800/60'
    : index % 2 === 0
    ? 'bg-transparent'
    : 'bg-gray-900/40';

  const handleClick = () => {
    onSelect();
    setSelectedTransaction(isSelected ? null : tx);
  };

  return (
    <>
      <tr
        data-tx-id={tx.id}
        onClick={handleClick}
        onDoubleClick={() => setExpanded(e => !e)}
        className={`border-b border-gray-800/60 cursor-pointer transition-colors hover:bg-gray-800/50 group ${rowBg}`}
      >
        {/* quality badge */}
        <td className="pl-3 pr-1 py-2 w-12">
          <ParseQualityBadge tx={tx} />
        </td>

        {/* date */}
        <td className="px-2 py-2 text-xs font-mono text-gray-300 whitespace-nowrap w-24">
          {tx.date || <span className="text-red-500/70 italic">no date</span>}
        </td>

        {/* narration */}
        <td className="px-2 py-2 text-xs text-gray-200 max-w-0 w-full">
          <div className="flex items-center gap-2">
            <span className="truncate" title={tx.narration}>{tx.narration || <span className="text-gray-600 italic">empty</span>}</span>
            {tx.sourceRows.length > 1 && (
              <span className="shrink-0 text-[10px] text-blue-400/70 bg-blue-400/10 px-1 rounded">
                +{tx.sourceRows.length - 1} rows
              </span>
            )}
          </div>
        </td>

        {/* amounts */}
        <AmountCell value={tx.debit}   color="text-red-400" />
        <AmountCell value={tx.credit}  color="text-green-400" />
        <AmountCell value={tx.balance} color="text-gray-300" />

        {/* expand toggle */}
        <td className="px-2 py-2 w-6 text-center">
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            className="text-gray-600 hover:text-gray-300 transition-colors text-xs leading-none"
            title="Expand row"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </td>
      </tr>

      {/* expanded detail */}
      {expanded && (
        <tr className={`border-b border-gray-700 ${tx.isSuspicious ? 'border-l-2 border-l-orange-500' : ''}`}>
          <td colSpan={7} className="px-4 py-3 bg-gray-900/80">
            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* left: narration + raw */}
              <div className="space-y-2">
                <div>
                  <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Full Narration</div>
                  <div className="text-gray-200 font-mono bg-gray-800 rounded p-2 break-all leading-relaxed">
                    {tx.narration || <span className="text-gray-600 italic">not extracted</span>}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Raw Text (PDF)</div>
                  <div className="text-gray-400 font-mono bg-gray-800/60 rounded p-2 break-all text-[11px] leading-relaxed">
                    {tx.rawText}
                  </div>
                </div>
              </div>

              {/* right: metadata */}
              <div className="space-y-2">
                <div>
                  <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Parse Details</div>
                  <div className="bg-gray-800 rounded p-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Transaction #</span>
                      <span className="text-gray-300 font-mono">{tx.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Source rows</span>
                      <span className="text-gray-300 font-mono">{tx.sourceRows.join(', ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Debit</span>
                      <span className={tx.debit ? 'text-red-400 font-mono' : 'text-gray-600 italic'}>
                        {tx.debit || 'not detected'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Credit</span>
                      <span className={tx.credit ? 'text-green-400 font-mono' : 'text-gray-600 italic'}>
                        {tx.credit || 'not detected'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Balance</span>
                      <span className={tx.balance ? 'text-gray-300 font-mono' : 'text-gray-600 italic'}>
                        {tx.balance || 'not detected'}
                      </span>
                    </div>
                  </div>
                </div>
                {tx.isSuspicious && (
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 text-orange-400 text-[11px]">
                    ⚠ Suspicious: {!tx.date ? 'No date found. ' : ''}{!tx.narration ? 'No narration. ' : ''}
                    Check source rows {tx.sourceRows.join(', ')} in overlay.
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
