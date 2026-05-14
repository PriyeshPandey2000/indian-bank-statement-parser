'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { JsonTextItem, ParseResultJson, PageRows, ReconstructedRow, DocumentTransactions, DetectedTransaction, PageColumnResult } from '../types';

export type ParseStatus = 'idle' | 'parsing' | 'done' | 'error';
export type RowStatus = 'idle' | 'reconstructing' | 'done' | 'error';
export type TxStatus = 'idle' | 'detecting' | 'done' | 'error';
export type ColStatus = 'idle' | 'detecting' | 'done' | 'error';

interface ViewerState {
  // document
  documentId: string | null;
  parsedData: ParseResultJson | null;
  parseStatus: ParseStatus;
  parseError: string | null;

  // navigation
  currentPage: number;
  totalPages: number;

  // zoom (1.0 = 100%)
  zoom: number;

  // bbox overlay
  showBBoxOverlay: boolean;
  hoveredItem: JsonTextItem | null;
  selectedItem: JsonTextItem | null;

  // row reconstruction
  rowData: PageRows[] | null;
  rowStatus: RowStatus;
  showRowOverlay: boolean;
  selectedRow: ReconstructedRow | null;
  rowOverlapThreshold: number;

  // actions — document
  initDocument: (id: string) => void;
  setParsedData: (data: ParseResultJson) => void;
  setParseStatus: (status: ParseStatus, error?: string) => void;

  // actions — navigation
  setPage: (page: number) => void;
  prevPage: () => void;
  nextPage: () => void;

  // actions — zoom
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitZoom: (containerWidth: number, containerHeight: number) => void;

  // actions — bbox overlay
  toggleBBoxOverlay: () => void;
  setHoveredItem: (item: JsonTextItem | null) => void;
  setSelectedItem: (item: JsonTextItem | null) => void;

  // actions — row overlay
  setRowData: (data: PageRows[]) => void;
  setRowStatus: (status: RowStatus) => void;
  toggleRowOverlay: () => void;
  setSelectedRow: (row: ReconstructedRow | null) => void;
  setRowOverlapThreshold: (threshold: number) => void;

  // column detection
  columnData: PageColumnResult[] | null;
  columnStatus: ColStatus;
  showColumnOverlay: boolean;
  setColumnData: (data: PageColumnResult[]) => void;
  setColumnStatus: (status: ColStatus) => void;
  toggleColumnOverlay: () => void;

  // transaction detection
  txData: DocumentTransactions[] | null;
  txStatus: TxStatus;
  selectedTransaction: DetectedTransaction | null;
  showTxOverlay: boolean;
  setTxData: (data: DocumentTransactions[]) => void;
  setTxStatus: (status: TxStatus) => void;
  toggleTxOverlay: () => void;
  setSelectedTransaction: (tx: DetectedTransaction | null) => void;

  reset: () => void;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

export const useViewerStore = create<ViewerState>()(
  devtools(
    (set, get) => ({
      documentId: null,
      parsedData: null,
      parseStatus: 'idle',
      parseError: null,
      currentPage: 1,
      totalPages: 0,
      zoom: 1,
      showBBoxOverlay: true,
      hoveredItem: null,
      selectedItem: null,
      rowData: null,
      rowStatus: 'idle',
      showRowOverlay: false,
      selectedRow: null,
      rowOverlapThreshold: 0.6,
      columnData: null,
      columnStatus: 'idle',
      showColumnOverlay: true,
      txData: null,
      txStatus: 'idle',
      selectedTransaction: null,
      showTxOverlay: true,

      initDocument: (id) =>
        set({ documentId: id, parseStatus: 'idle', currentPage: 1, rowData: null, rowStatus: 'idle' }),

      setParsedData: (data) =>
        set({ parsedData: data, totalPages: data.pages.length, parseStatus: 'done', currentPage: 1 }),

      setParseStatus: (status, error) =>
        set({ parseStatus: status, parseError: error ?? null }),

      setPage: (page) => {
        const { totalPages } = get();
        const clamped = Math.max(1, Math.min(page, totalPages));
        set({ currentPage: clamped, hoveredItem: null, selectedItem: null, selectedRow: null });
      },

      prevPage: () => get().setPage(get().currentPage - 1),
      nextPage: () => get().setPage(get().currentPage + 1),

      setZoom: (zoom) => set({ zoom: Math.max(ZOOM_MIN, Math.min(zoom, ZOOM_MAX)) }),

      zoomIn: () => {
        const { zoom, setZoom } = get();
        setZoom(Math.round((zoom + ZOOM_STEP) * 4) / 4);
      },

      zoomOut: () => {
        const { zoom, setZoom } = get();
        setZoom(Math.round((zoom - ZOOM_STEP) * 4) / 4);
      },

      resetZoom: () => set({ zoom: 1 }),

      fitZoom: (containerWidth, containerHeight) => {
        const { parsedData, currentPage } = get();
        if (!parsedData) return;
        const page = parsedData.pages[currentPage - 1];
        if (!page) return;
        // PDF points → pixels at 150 DPI (hardcoded to match parseService.ts)
        const imgW = page.width * (150 / 72);
        const imgH = page.height * (150 / 72);
        const fit = Math.min(containerWidth / imgW, containerHeight / imgH, 1);
        set({ zoom: Math.max(ZOOM_MIN, Math.round(fit * 4) / 4) });
      },

      toggleBBoxOverlay: () => set((s) => ({ showBBoxOverlay: !s.showBBoxOverlay })),
      setHoveredItem: (item) => set({ hoveredItem: item }),
      setSelectedItem: (item) =>
        set((s) => ({ selectedItem: s.selectedItem === item ? null : item })),

      setRowData: (data) => set({ rowData: data, rowStatus: 'done' }),
      setRowStatus: (status) => set({ rowStatus: status }),
      toggleRowOverlay: () => set((s) => ({ showRowOverlay: !s.showRowOverlay })),
      setSelectedRow: (row) => set((s) => ({ selectedRow: s.selectedRow === row ? null : row })),
      setRowOverlapThreshold: (threshold) => set({ rowOverlapThreshold: threshold }),

      setColumnData: (data) => set({ columnData: data, columnStatus: 'done' }),
      setColumnStatus: (status) => set({ columnStatus: status }),
      toggleColumnOverlay: () => set((s) => ({ showColumnOverlay: !s.showColumnOverlay })),

      setTxData: (data) => set({ txData: data, txStatus: 'done' }),
      setTxStatus: (status) => set({ txStatus: status }),
      toggleTxOverlay: () => set((s) => ({ showTxOverlay: !s.showTxOverlay })),
      setSelectedTransaction: (tx) => set({ selectedTransaction: tx }),

      reset: () =>
        set({
          documentId: null,
          parsedData: null,
          parseStatus: 'idle',
          parseError: null,
          currentPage: 1,
          totalPages: 0,
          zoom: 1,
          showBBoxOverlay: true,
          hoveredItem: null,
          selectedItem: null,
          rowData: null,
          rowStatus: 'idle',
          showRowOverlay: false,
          selectedRow: null,
          rowOverlapThreshold: 0.6,
          columnData: null,
          columnStatus: 'idle',
          showColumnOverlay: true,
          txData: null,
          txStatus: 'idle',
          selectedTransaction: null,
          showTxOverlay: true,
        }),
    }),
    { name: 'viewer-store' }
  )
);
