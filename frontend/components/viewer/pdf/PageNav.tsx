'use client';

import { useViewerStore } from '@/lib/store/viewerStore';

export default function PageNav() {
  const currentPage = useViewerStore((s) => s.currentPage);
  const totalPages = useViewerStore((s) => s.totalPages);
  const prevPage = useViewerStore((s) => s.prevPage);
  const nextPage = useViewerStore((s) => s.nextPage);
  const setPage = useViewerStore((s) => s.setPage);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={prevPage}
        disabled={currentPage <= 1}
        className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
      >
        ‹
      </button>

      <div className="flex items-center gap-1 text-sm text-gray-300">
        <input
          type="number"
          min={1}
          max={totalPages}
          value={currentPage}
          onChange={(e) => setPage(parseInt(e.target.value) || 1)}
          className="w-10 text-center bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white text-sm focus:outline-none focus:border-blue-400"
        />
        <span className="text-gray-500">/ {totalPages}</span>
      </div>

      <button
        onClick={nextPage}
        disabled={currentPage >= totalPages}
        className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
      >
        ›
      </button>
    </div>
  );
}
