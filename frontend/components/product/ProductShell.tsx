'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useViewerStore } from '@/lib/store/viewerStore';
import {
  getParsedData, getTransactions,
  parseDocument, extractTransactions,
} from '@/lib/api';
import ProcessBar from './ProcessBar';
import PdfPanel from './PdfPanel';
import TxPanel from './TxPanel';

export type PipelineStage = 'idle' | 'parsing' | 'rows' | 'analysing' | 'done' | 'error';

interface Props {
  documentId: string;
}

export default function ProductShell({ documentId }: Props) {
  const initDocument  = useViewerStore(s => s.initDocument);
  const setParsedData = useViewerStore(s => s.setParsedData);
  const setTxData     = useViewerStore(s => s.setTxData);
  const txData        = useViewerStore(s => s.txData);

  const [stage, setStage] = useState<PipelineStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef          = useRef(false);

  const runPipeline = useCallback(async () => {
    abortRef.current = false;
    setError(null);
    try {
      setStage('parsing');
      await parseDocument(documentId);
      if (abortRef.current) return;
      const parsed = await getParsedData(documentId);
      if (abortRef.current) return;
      setParsedData(parsed);

      setStage('analysing');
      await extractTransactions(documentId);
      if (abortRef.current) return;

      const finalTxs = await getTransactions(documentId);
      setTxData(finalTxs);

      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline failed');
      setStage('error');
    }
  }, [documentId, setParsedData, setTxData]);

  // On mount: load existing data or auto-start pipeline for fresh uploads
  useEffect(() => {
    initDocument(documentId);
    (async () => {
      try {
        const [parsed, txs] = await Promise.all([
          getParsedData(documentId).catch(() => null),
          getTransactions(documentId).catch(() => null),
        ]);
        if (parsed) setParsedData(parsed);
        if (txs && txs.length > 0) {
          setTxData(txs);
          setStage('done');
        } else {
          runPipeline();
        }
      } catch {
        runPipeline();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const allTx           = txData?.flatMap(p => p.result.transactions) ?? [];
  const bankProfileId   = txData?.find(p => p.result.bankProfileId)?.result.bankProfileId;
  const dates           = allTx.map(t => t.date).filter(Boolean).sort();
  const statementPeriod = dates.length >= 2 ? `${dates[0]} – ${dates[dates.length - 1]}` : undefined;

  return (
    <div className="h-screen flex flex-col bg-gray-950 overflow-hidden">
      <ProcessBar
        documentId={documentId}
        stage={stage}
        error={error}
        bankProfileId={bankProfileId}
        statementPeriod={statementPeriod}
        onProcess={runPipeline}
        hasData={allTx.length > 0}
      />

      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal" className="h-full">
          <Panel defaultSize={55} minSize={25}>
            <PdfPanel />
          </Panel>

          <Separator className="w-1 bg-gray-800 hover:bg-blue-500/60 transition-colors cursor-col-resize" />

          <Panel defaultSize={45} minSize={20}>
            <TxPanel />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
