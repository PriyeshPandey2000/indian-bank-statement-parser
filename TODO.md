# Product Roadmap — Debugger → Product

## Phase 1: Remove debug UI

- [ ] Remove BBox overlay, row overlay, column overlay (all 3 overlays + toggles)
- [ ] Remove threshold slider
- [ ] Remove debug sidebar (item inspector, page info)
- [ ] Remove "Rows" / "Cols" buttons — user never sees these
- [ ] Remove raw text view in expanded transaction row
- [ ] Remove source row IDs and parse quality badge
- [ ] Remove all other developer-facing controls

## Phase 2: Auto-pipeline (biggest change)

Replace 4 manual steps (Rows → Cols → Detect → Export) with one "Process" button.

Flow: Upload PDF → auto parse → auto rows → auto columns → auto transactions  
Single progress bar with labelled stages. User waits once, gets results.

- [ ] New `/api/document/:id/process` endpoint that chains all 4 steps
- [ ] Frontend: single "Process" button with stage progress bar
- [ ] Remove individual step buttons from toolbar

## Phase 3: New review screen

Replace current viewer with 2-panel layout:

- [ ] Left panel: PDF thumbnail (read-only, no overlays) for visual verification
- [ ] Right panel: clean transaction table — Date, Narration, Debit, Credit, Balance only
- [ ] Summary card above table:
  - Statement period (first date → last date)
  - Bank name (from auto-detected profile)
  - Total transactions
  - Total debited / total credited
  - Anomaly count in plain English (e.g. "3 rows couldn't be parsed")

## Phase 4: Anomaly UX

Replace orange "⚠ suspicious" badge with plain English inline warnings.

- [ ] Message: "3 rows couldn't be parsed — review before downloading"
- [ ] Highlight those rows inline in table
- [ ] Optional: manual edit fields for bad rows

## Phase 5: Monetisation

- [ ] Auth — Clerk or Supabase Auth (est. 1 day)
- [ ] Credit system or subscription via Stripe — 1 upload = 1 credit
- [ ] Usage limits per plan
- [ ] Document history page (list of past uploads with download links)

---

## What stays unchanged

- Upload zone (already good)
- Password-protected PDF support
- Bank auto-detection (Axis / Kotak / HDFC / PNB)
- CSV export
- Entire backend

---

## Backlog / Nice to have

- [ ] Sort CSV by date ascending before export — PNB statements are reverse-chrono (newest first) which confuses accountants. One line fix in `exportController.ts`.

- [ ] Balance continuity check + user-facing warning — backend computes running balance diff after pipeline; if `abs(expected - actual) > 0.5` for any row, surface count in summary card: "X balance mismatches detected — source statement may be incomplete." Cause is usually SBI/other banks omitting hidden charges or transactions from their PDF export (not a parsing bug). Backend: add `balanceMismatches: number` field to pipeline response. Frontend: show inline in summary card, yellow banner, non-blocking.
