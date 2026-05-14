'use client';

import { useViewerStore } from '@/lib/store/viewerStore';

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function ZoomControls() {
  const zoom = useViewerStore((s) => s.zoom);
  const zoomIn = useViewerStore((s) => s.zoomIn);
  const zoomOut = useViewerStore((s) => s.zoomOut);
  const resetZoom = useViewerStore((s) => s.resetZoom);
  const setZoom = useViewerStore((s) => s.setZoom);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={zoomOut}
        className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        title="Zoom out"
      >
        −
      </button>

      <select
        value={zoom}
        onChange={(e) => setZoom(parseFloat(e.target.value))}
        className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-blue-400 cursor-pointer"
      >
        {ZOOM_PRESETS.map((z) => (
          <option key={z} value={z}>
            {Math.round(z * 100)}%
          </option>
        ))}
        {!ZOOM_PRESETS.includes(zoom) && (
          <option value={zoom}>{Math.round(zoom * 100)}%</option>
        )}
      </select>

      <button
        onClick={zoomIn}
        className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        title="Zoom in"
      >
        +
      </button>

      <button
        onClick={resetZoom}
        className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        title="Reset zoom"
      >
        Reset
      </button>
    </div>
  );
}
