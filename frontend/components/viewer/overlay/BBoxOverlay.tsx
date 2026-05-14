'use client';

import { useViewerStore } from '@/lib/store/viewerStore';
import type { JsonTextItem } from '@/lib/types';
import { useState } from 'react';

interface TooltipState {
  item: JsonTextItem;
  x: number;
  y: number;
}

export default function BBoxOverlay() {
  const parsedData = useViewerStore((s) => s.parsedData);
  const currentPage = useViewerStore((s) => s.currentPage);
  const showBBoxOverlay = useViewerStore((s) => s.showBBoxOverlay);
  const selectedItem = useViewerStore((s) => s.selectedItem);
  const setHoveredItem = useViewerStore((s) => s.setHoveredItem);
  const setSelectedItem = useViewerStore((s) => s.setSelectedItem);

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (!parsedData || !showBBoxOverlay) return null;

  const page = parsedData.pages[currentPage - 1];
  if (!page) return null;

  const handleMouseEnter = (item: JsonTextItem, e: React.MouseEvent) => {
    setHoveredItem(item);
    setTooltip({ item, x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
    setTooltip(null);
  };

  return (
    <>
      <svg
        viewBox={`0 0 ${page.width} ${page.height}`}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'all' }}
      >
        {page.textItems.map((item, i) => {
          const isSelected = selectedItem === item;
          return (
            <rect
              key={i}
              x={item.x}
              y={item.y}
              width={item.width}
              height={item.height}
              fill={isSelected ? 'rgba(234, 179, 8, 0.25)' : 'rgba(59, 130, 246, 0.08)'}
              stroke={isSelected ? 'rgb(234, 179, 8)' : 'rgb(59, 130, 246)'}
              strokeWidth={isSelected ? 1 : 0.5}
              className="cursor-pointer transition-colors"
              onMouseEnter={(e) => handleMouseEnter(item, e)}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={() => setSelectedItem(item)}
            />
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-2 max-w-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <div className="text-white text-xs font-mono break-all">&ldquo;{tooltip.item.text}&rdquo;</div>
          <div className="mt-1 text-gray-400 text-xs space-y-0.5">
            <div>x: {tooltip.item.x.toFixed(1)}  y: {tooltip.item.y.toFixed(1)}</div>
            <div>w: {tooltip.item.width.toFixed(1)}  h: {tooltip.item.height.toFixed(1)}</div>
            {tooltip.item.fontSize && <div>font: {tooltip.item.fontSize.toFixed(1)}pt</div>}
          </div>
        </div>
      )}
    </>
  );
}
