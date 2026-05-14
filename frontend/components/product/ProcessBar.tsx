'use client';

import type { PipelineStage } from './ProductShell';
import { exportCsvUrl } from '@/lib/api';

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle:      '',
  parsing:   'Parsing PDF…',
  rows:      'Reconstructing rows…',
  analysing: 'Detecting transactions…',
  done:      '',
  error:     '',
};

const STAGES_ORDER: PipelineStage[] = ['parsing', 'rows', 'analysing', 'done'];

const BANK_NAMES: Record<string, string> = {
  axis:    'Axis Bank',
  hdfc:    'HDFC Bank',
  kotak:   'Kotak Mahindra',
  pnb:     'Punjab National Bank',
  generic: 'Generic',
};

interface Props {
  documentId: string;
  stage: PipelineStage;
  error: string | null;
  bankProfileId?: string;
  statementPeriod?: string;
  onProcess: () => void;
  hasData: boolean;
}

export default function ProcessBar({
  documentId, stage, error, bankProfileId, statementPeriod, onProcess, hasData,
}: Props) {
  const isRunning = stage !== 'idle' && stage !== 'done' && stage !== 'error';
  const isDone = stage === 'done';
  const bankLabel = bankProfileId ? (BANK_NAMES[bankProfileId] ?? bankProfileId) : null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 shrink-0">
      {/* left: bank + period info */}
      <div className="flex items-center gap-3 min-w-0">
        {isDone && bankLabel && (
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
            bankProfileId === 'generic'
              ? 'bg-gray-700/40 text-gray-400 border-gray-600/40'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
          }`}>
            {bankLabel}
          </span>
        )}
        {isDone && statementPeriod && (
          <span className="text-[11px] text-gray-500">{statementPeriod}</span>
        )}
        {isRunning && (
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div className="flex items-center gap-1">
              {STAGES_ORDER.slice(0, -1).map((s) => {
                const stageIdx = STAGES_ORDER.indexOf(stage);
                const thisIdx = STAGES_ORDER.indexOf(s);
                const done = thisIdx < stageIdx;
                const active = thisIdx === stageIdx;
                return (
                  <span key={s} className={`text-[11px] transition-colors ${
                    active ? 'text-blue-400 font-medium' : done ? 'text-gray-600' : 'text-gray-700'
                  }`}>
                    {STAGE_LABELS[s]}{thisIdx < STAGES_ORDER.length - 2 ? ' →' : ''}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {error && (
          <span className="text-[11px] text-red-400">Error: {error}</span>
        )}
        {stage === 'idle' && !hasData && (
          <span className="text-[11px] text-gray-600">Click Process to extract transactions</span>
        )}
      </div>

      {/* right: actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isDone && (
          <a
            href={exportCsvUrl(documentId)}
            download
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors font-medium"
          >
            ↓ CSV
          </a>
        )}
        <button
          onClick={onProcess}
          disabled={isRunning}
          className="px-3 py-1.5 text-xs rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors font-medium"
        >
          {isRunning ? 'Processing…' : hasData ? 'Re-process' : 'Process'}
        </button>
      </div>
    </div>
  );
}
