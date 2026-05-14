# PDF Parser — Progress & Decision Log

## Stack Decisions

| Concern | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind | App Router, server components where possible |
| State | Zustand | No providers, works outside React, tiny, devtools via middleware |
| Backend | Express 5 + TypeScript + tsx | Express 5 for async error handling; tsx over ts-node for ESM interop |
| Parser | LiteParse `@llamaindex/liteparse` | Spatial bounding-box extraction, runs locally |
| Storage | Local filesystem (`backend/storage/<uuid>/`) | Internal tool, no cloud needed |
| Ports | Frontend 3000 / Backend 8000 | Standard Next.js + separate Express |
| Package manager | npm | User preference |
| Panel resizing | `react-resizable-panels` | Drag-to-resize, headless, no layout thrash |

---

## Architecture Decisions

### ESM / CJS interop (CRITICAL)
- **Decision**: Use `tsx` as runner instead of `ts-node`
- **Why**: LiteParse is pure ESM (`"type": "module"`, `"exports": { "import": ... }` only). CommonJS dynamic `import()` inside `ts-node` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `tsx` handles ESM→CJS bridging transparently.
- **Watch out**: If switching runner (e.g. to `ts-node` or raw `node`), LiteParse import will break silently returning 500.

### Separate directories (no monorepo)
- **Decision**: `frontend/` and `backend/` as sibling dirs, no workspace tooling
- **Why**: Simplicity, user preference
- **Watch out**: No shared types. `frontend/lib/types.ts` mirrors `@llamaindex/liteparse` types — if LiteParse type shapes change, both must be updated manually.

### Row reconstruction placement
- **Decision**: Backend service (`src/reconstruction/`) saves `rows.json`, exposed via API
- **Why**: PRD specifies backend reconstruction services; enables batch processing later
- **Watch out**: Threshold tuning is bank-specific. Single threshold won't work across all layouts. Future: make threshold a query param.

### Screenshot serving
- **Decision**: Backend serves screenshots via `GET /api/document/:id/screenshot/:page`
- **Watch out**: No caching headers beyond `Cache-Control: public, max-age=3600`. For large PDFs with many pages, cold load will be slow. Future: pre-generate all screenshots during parse.

### BBox coordinate system
- **Decision**: SVG `viewBox` matches PDF point dimensions; browser scales automatically
- **Why**: LiteParse returns coordinates in PDF points (72 DPI). Screenshots rendered at 150 DPI. SVG viewBox approach avoids manual coordinate scaling.
- **Watch out**: If DPI changes from 150, screenshots and overlays stay aligned (SVG handles it). But `fitZoom` calculation in store uses `150/72` hardcoded — update if DPI config changes.

### Pipeline execution order (CRITICAL)
- **Decision**: `detect-transactions` must run BEFORE `detect-columns`
- **Why**: `detect-columns` re-runs transaction detection internally with column data. Running `detect-columns` first then `detect-transactions` overwrites the column-refined results with unrefined results.
- **Watch out**: Order is parse → reconstruct-rows → detect-transactions → detect-columns.

### Multi-page column carry-forward
- **Decision**: `columnService.ts` tracks `lastKnownColumns` and `lastKnownProfileId` across pages
- **Why**: Pages 2+ of bank statements have no header row. Without carry-forward, every page after page 1 gets Generic profile with 0 transactions.
- **Watch out**: Carry-forward resets per document processing run. State is in-memory per request.

### Axis narration extraction — positional approach
- **Decision**: Use `item.x` (left-edge) positioned between `DATE.xEnd` and `DEBIT.xStart`, not center-based column assignment
- **Why**: Short narration text (e.g. "IIL-UTIMF SMS") has center cx that falls left of the NARRATION column boundary, landing in CHQ column. Left-edge is always 132.1 for Axis narrations regardless of text width.
- **Watch out**: This is Axis-specific. Other banks use `narrationItemsFromRow` fallback.

### Route architecture
- **Decision**: `/` = product upload → `/doc/[id]` = product viewer; `/debug` = debug upload → `/debug/viewer/[id]` = debug viewer
- **Why**: Product and debug UIs coexist. Debug UI preserved untouched for development.

---

## Known Issues / Console Noise

- `GET /api/document/:id/parsed` returns 404 twice on first load — viewer tries fetching existing parse before triggering fresh parse. Benign. Suppressing would require a "document status" endpoint.

---

## Features Status

| Feature | Status | Notes |
|---|---|---|
| 1 — PDF Upload | ✅ Done | `POST /api/upload`, multer 50MB, PDF-only, password support |
| 2 — LiteParse Extraction | ✅ Done | `POST /api/document/:id/parse`, saves parsed.json + screenshots |
| 3 — PDF Viewer (debug) | ✅ Done | Page image, zoom, navigation |
| 4 — BBox Overlay | ✅ Done | SVG overlay, hover tooltip, click-select, toggle |
| 5 — Row Reconstruction | ✅ Done | Backend `reconstructRows()`, `POST /:id/reconstruct-rows?threshold=`, frontend RowOverlay + threshold slider |
| 6 — Transaction Detection | ✅ Done | Date regex, HEADER/TRANSACTION/CONTINUATION/OTHER classification, continuation merging |
| 7 — Column Detection | ✅ Done | Header keyword matching → column boundaries, fills debit/credit/balance, dashed overlay guides |
| 8 — Transaction Table (debug) | ✅ Done | Quality badge, expand row, sort, suspicious filter, keyboard nav, stats bar |
| 9 — CSV Export | ✅ Done | `GET /api/document/:id/export/csv`, tab-delimited, all transaction fields |
| 10 — Multi-page support | ✅ Done | Column + profile carry-forward across headerless pages; tested on 14-page Axis and 14-page PNB |
| 11 — Axis Bank | ✅ Done | Post-narration flow, positional narration extraction (left-edge x ≥ DATE.xEnd, x < DEBIT.xStart) |
| 12 — HDFC Bank | ✅ Done | Original implementation |
| 13 — Kotak Bank | ✅ Done | Original implementation |
| 14 — PNB Bank | ✅ Done | New `AMOUNT` + `DR_CR` column types, `Type(DR/CR)` resolution, page footer skip pattern |
| 15 — Product UI | ✅ Done | `/doc/[id]` route, resizable left (PDF) + right (transactions) panels, auto-pipeline on load, bank badge + period in top bar |
| 16 — Auto-pipeline | ✅ Done | Upload → redirect → pipeline starts automatically; no manual "Process" click needed for fresh uploads |

---

## Bank Profile Implementation Notes

### Axis Bank
- Flow: post-narration (date row has narration inline)
- Narration: positional extraction — items with `x ∈ [DATE.xEnd, DEBIT.xStart)`, excluding pure numbers
- Multi-page: columns + profile carry-forward from page 1

### HDFC Bank
- Flow: post-narration
- Narration: standard `narrationItemsFromRow` (center-based column assignment)

### Kotak Bank
- Flow: post-narration
- Narration: standard `narrationItemsFromRow`

### PNB Bank
- Flow: post-narration
- Columns: `AMOUNT` (Amount(INR)) + `DR_CR` (Type DR/CR) instead of separate Debit/Credit
- Amount resolution: collects `pendingAmount` + `pendingType` per transaction, assigns to debit/credit at end
- Special rows: `\bPage\s+\d+\b` pattern skips page footer lines from becoming CONTINUATION rows
- Statement order: reverse-chronological (newest first)

### Generic
- Fallback when no bank-specific profile matches
- Standard column detection + narration extraction

---

## Future / Watch-Out Items

1. **More banks**: SBI, ICICI, IndusInd, Yes Bank, BoB, Canara — all need real statement PDFs to test column layouts and narration patterns.

2. **LiteParse version drift**: `@llamaindex/liteparse` is under active development. `BoundingBox` type is deprecated in favor of `TextItem` coordinates. Currently using `textItems` (correct). Don't switch back to `boundingBoxes`.

3. **Storage cleanup**: No TTL or cleanup on `backend/storage/`. Will grow indefinitely. Add cleanup cron before any shared/team use.

4. **Column detection robustness**: current approach uses header row keyword matching. Fails if header is missing, multi-line, or uses non-English labels. Future: X-clustering fallback using right-edges of amount-like items.

5. **OCR on scanned statements**: LiteParse OCR uses Tesseract.js by default. For Hindi/regional Indian bank statements, add `ocrLanguage: 'hin'` or point to EasyOCR server.

6. **Large PDFs**: Parsing + screenshotting is synchronous in the request handler. A 50-page statement will hold the Express thread. Future: queue with job status polling.

7. **CORS**: Backend hardcoded to `origin: 'http://localhost:3000'`. Change before any deployment.

8. **No auth**: Intentional for now. Add Clerk/Supabase Auth for paid product.

9. **CSV sort order**: PNB exports reverse-chrono. Sort ascending by date in `exportController.ts` before shipping to accountants.

10. **Balance continuity check**: Manual verification only. Future: auto-validate in backend and surface as badge/warning in product UI.

---

## File Map (key files)

```
backend/src/
  index.ts                         entry, route registration
  routes/upload.ts                  POST /api/upload
  routes/document.ts                parse, rows, tx, columns, export
  controllers/
    uploadController.ts
    parseController.ts
    rowController.ts
    txController.ts
    columnController.ts
    exportController.ts
  services/
    uploadService.ts                save PDF, check existence
    parseService.ts                 LiteParse run, screenshot gen, file I/O
    rowService.ts                   row reconstruction
    txService.ts                    transaction detection orchestration
    columnService.ts                column detection + carry-forward across pages
  reconstruction/
    bankProfiles.ts                 AXIS, HDFC, KOTAK, PNB, GENERIC profiles
    columnDetection.ts              column type detection + fillTransactionAmounts
    rowReconstruction.ts            y-overlap grouping
    transactionDetection.ts         HEADER/TRANSACTION/CONTINUATION/OTHER + merge
  utils/storage.ts                  path helpers

frontend/
  app/
    page.tsx                        → UploadZone (redirectBase=/doc)
    doc/[id]/page.tsx               → ProductShell
    debug/page.tsx                  → UploadZone (redirectBase=/debug/viewer)
    debug/viewer/[id]/page.tsx      → ViewerLayout (debug UI unchanged)
    upload/page.tsx                 legacy upload page
    viewer/[id]/page.tsx            legacy viewer page
  components/
    product/
      ProductShell.tsx              orchestrator: pipeline logic + resizable layout
      ProcessBar.tsx                stage progress + bank badge + CSV download
      PdfPanel.tsx                  scrollable PDF pages, intersection observer
      TxPanel.tsx                   clean transaction table + summary bar
    upload/
      UploadZone.tsx                drag-drop upload, password field, redirectBase prop
    viewer/                         debug UI (unchanged)
  lib/
    types.ts                        mirrors backend types
    api.ts                          typed fetch client
    store/viewerStore.ts            Zustand store (shared by debug + product UIs)
```
