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

## Vision LLM — bank profile auto-detection (reliability upgrade)

Current rule-based system is fragile: new bank = manual profile, needs real PDF first. Multi-line headers (ICICI 3-row), truncated column names ("Withdra"), 6 date regexes that still miss edge cases, split amounts (ICICI trailing-dot + leading-dot — unknown what bank 7 does).

**Proposal**: before parsing, send page 1 screenshot to vision LLM. Ask for column layout, date format, narration flow, bank identity. Use response to build a dynamic `BankProfile` at runtime — rest of pipeline unchanged.

**What LLM gives for free**: non-English headers, rotated text, multi-line headers, any date format, whether amounts are split across rows, pre vs post narration flow.

**Architecture**: LLM call → structured JSON `{ bank, dateFormat, columns: [{name, position, type}], narrationFlow }` → dynamic BankProfile → existing pipeline. If LLM call fails → fallback to current keyword matching.

**Tradeoffs**:
- New bank support: zero code vs. write profile manually
- Reliability: high (model handles variation) vs. fragile (breaks on new format)  
- Latency: +2-4s per upload (one API call)
- Cost: ~$0.002–0.005 per statement
- Failure mode: LLM hallucinates column name vs. silent wrong parse
- Privacy: data leaves device vs. fully local

**Tasks**:
- [ ] Design prompt: page 1 screenshot → JSON schema for `DynamicBankProfile`
- [ ] `profileService.ts` — calls vision API, parses response, validates schema, builds BankProfile
- [ ] Fallback: if LLM unavailable or confidence low, fall through to existing keyword profiles
- [ ] Cache result per document (don't re-call on pipeline re-runs)
- [ ] Test on SBI, ICICI, Axis, HDFC, Kotak, PNB — verify LLM output matches hand-written profiles

---

## Backlog / Nice to have

- [ ] Fix statement period date range display — dates sorted as strings so `DD-MM-YYYY` format sorts wrong (e.g. shows "01-01-2026 – 31-07-2025" instead of correct range). Need to parse dates to actual Date objects before sorting. Cosmetic only, not a data issue.


- [ ] Sort CSV by date ascending before export — PNB statements are reverse-chrono (newest first) which confuses accountants. One line fix in `exportController.ts`.

- [ ] Balance continuity check + user-facing warning — backend computes running balance diff after pipeline; if `abs(expected - actual) > 0.5` for any row, surface count in summary card: "X balance mismatches detected — source statement may be incomplete." Cause is usually SBI/other banks omitting hidden charges or transactions from their PDF export (not a parsing bug). Backend: add `balanceMismatches: number` field to pipeline response. Frontend: show inline in summary card, yellow banner, non-blocking.
