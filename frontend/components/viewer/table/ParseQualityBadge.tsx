'use client';

import type { DetectedTransaction } from '@/lib/types';

export type ParseQuality = 'good' | 'partial' | 'poor';

export function getParseQuality(tx: DetectedTransaction): ParseQuality {
  const hasDate = !!tx.date;
  const hasNarration = !!tx.narration && tx.narration.length > 2;
  const hasAmount = !!(tx.debit || tx.credit);
  const hasBalance = !!tx.balance;

  if (hasDate && hasNarration && hasAmount && hasBalance) return 'good';
  if (hasDate && hasNarration) return 'partial';
  return 'poor';
}

const CONFIG: Record<ParseQuality, { label: string; classes: string; dot: string }> = {
  good:    { label: 'OK',   classes: 'bg-green-500/15 text-green-400 border-green-500/30',  dot: 'bg-green-400' },
  partial: { label: 'AMT', classes: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
  poor:    { label: 'ERR', classes: 'bg-red-500/15 text-red-400 border-red-500/30',         dot: 'bg-red-400' },
};

export default function ParseQualityBadge({ tx }: { tx: DetectedTransaction }) {
  const quality = getParseQuality(tx);
  const { label, classes, dot } = CONFIG[quality];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono leading-none ${classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
