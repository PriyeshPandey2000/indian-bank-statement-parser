'use client';

import { useEffect, useRef } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';
import { screenshotUrl } from '@/lib/api';

interface Props {
  onPageVisible?: (page: number) => void;
}

export default function PdfPanel({ onPageVisible }: Props) {
  const documentId = useViewerStore(s => s.documentId);
  const parsedData = useViewerStore(s => s.parsedData);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection observer — report which page is most visible
  useEffect(() => {
    if (!onPageVisible || !containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const page = parseInt((visible.target as HTMLElement).dataset.page ?? '1', 10);
          onPageVisible(page);
        }
      },
      { root: containerRef.current, threshold: [0.1, 0.5, 1.0] }
    );
    const nodes = containerRef.current.querySelectorAll('[data-page]');
    nodes.forEach(n => observer.observe(n));
    return () => observer.disconnect();
  }, [parsedData, onPageVisible]);

  if (!documentId || !parsedData) {
    return (
      <div className="h-full flex items-center justify-center text-gray-700 text-sm">
        No document loaded
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-gray-950 px-4 py-4 space-y-4"
    >
      {parsedData.pages.map((page) => {
        const imgW = Math.round(page.width  * (150 / 72));
        const imgH = Math.round(page.height * (150 / 72));
        const aspectRatio = imgW / imgH;
        return (
          <div
            key={page.page}
            data-page={page.page}
            className="w-full bg-white rounded shadow-lg overflow-hidden"
            style={{ aspectRatio }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl(documentId, page.page)}
              alt={`Page ${page.page}`}
              className="w-full h-full object-contain block"
              loading={page.page <= 2 ? 'eager' : 'lazy'}
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
}
