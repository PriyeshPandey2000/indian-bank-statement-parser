'use client';

import { useEffect } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';
import { parseDocument, getParsedData } from '@/lib/api';
import PDFViewer from './pdf/PDFViewer';
import PageNav from './pdf/PageNav';
import ZoomControls from './pdf/ZoomControls';
import OverlayControls from './overlay/OverlayControls';
import DebugSidebar from './sidebar/DebugSidebar';
import TransactionTable from './table/TransactionTable';

interface ViewerLayoutProps {
  documentId: string;
}

function StatusBar() {
  const parseStatus = useViewerStore((s) => s.parseStatus);
  const parseError = useViewerStore((s) => s.parseError);
  const parsedData = useViewerStore((s) => s.parsedData);
  const currentPage = useViewerStore((s) => s.currentPage);

  if (parseStatus === 'parsing') {
    return (
      <div className="flex items-center gap-2 text-xs text-blue-400">
        <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        Parsing PDF...
      </div>
    );
  }

  if (parseStatus === 'error') {
    return <div className="text-xs text-red-400">Error: {parseError}</div>;
  }

  if (parseStatus === 'done' && parsedData) {
    const page = parsedData.pages[currentPage - 1];
    return (
      <div className="text-xs text-green-400">
        {parsedData.pages.length} page{parsedData.pages.length !== 1 ? 's' : ''} · {page?.textItems.length ?? 0} items on page
      </div>
    );
  }

  return null;
}

export default function ViewerLayout({ documentId }: ViewerLayoutProps) {
  const initDocument = useViewerStore((s) => s.initDocument);
  const setParsedData = useViewerStore((s) => s.setParsedData);
  const setParseStatus = useViewerStore((s) => s.setParseStatus);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      initDocument(documentId);
      setParseStatus('parsing');

      try {
        // try fetching existing parse result first
        try {
          const existing = await getParsedData(documentId);
          if (!cancelled) {
            setParsedData(existing);
            return;
          }
        } catch {
          // not yet parsed — continue to parse
        }

        await parseDocument(documentId);
        if (cancelled) return;

        const data = await getParsedData(documentId);
        if (!cancelled) setParsedData(data);
      } catch (err) {
        if (!cancelled) {
          setParseStatus('error', err instanceof Error ? err.message : 'Failed');
        }
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [documentId, initDocument, setParsedData, setParseStatus]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-xs font-mono truncate max-w-48" title={documentId}>
            {documentId}
          </span>
          <StatusBar />
        </div>

        <div className="flex items-center gap-4">
          <OverlayControls />
          <div className="w-px h-4 bg-gray-700" />
          <ZoomControls />
          <div className="w-px h-4 bg-gray-700" />
          <PageNav />
        </div>
      </div>

      {/* main area */}
      <div className="flex flex-1 overflow-hidden">
        <PDFViewer />
        <DebugSidebar />
      </div>

      {/* transaction table */}
      <TransactionTable />
    </div>
  );
}
