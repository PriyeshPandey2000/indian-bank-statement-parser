'use client';

import { useViewerStore } from '@/lib/store/viewerStore';
import { screenshotUrl } from '@/lib/api';
import BBoxOverlay from '../overlay/BBoxOverlay';
import RowOverlay from '../overlay/RowOverlay';
import TransactionOverlay from '../overlay/TransactionOverlay';
import ColumnOverlay from '../overlay/ColumnOverlay';

export default function PDFViewer() {
  const documentId = useViewerStore((s) => s.documentId);
  const currentPage = useViewerStore((s) => s.currentPage);
  const zoom = useViewerStore((s) => s.zoom);
  const parsedData = useViewerStore((s) => s.parsedData);

  if (!documentId || !parsedData) return null;

  const page = parsedData.pages[currentPage - 1];
  if (!page) return null;

  // PDF points → pixels at 150 DPI
  const imgW = Math.round(page.width * (150 / 72));
  const imgH = Math.round(page.height * (150 / 72));

  return (
    <div className="flex-1 overflow-auto bg-gray-950 flex items-start justify-center p-6">
      {/* zoom wrapper */}
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          width: imgW,
          height: imgH,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {/* page image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshotUrl(documentId, currentPage)}
          alt={`Page ${currentPage}`}
          width={imgW}
          height={imgH}
          className="block select-none"
          draggable={false}
        />

        {/* overlays — order: rows → transactions → columns → bboxes (bboxes always on top) */}
        <RowOverlay />
        <TransactionOverlay />
        <ColumnOverlay />
        <BBoxOverlay />
      </div>
    </div>
  );
}
