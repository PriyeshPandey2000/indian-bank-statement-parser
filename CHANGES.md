# Direct Extraction Pipeline — Change Log

## What changed and why

### 1. `backend/src/services/directParseService.ts` — table detection fix

**Change:** Before locking onto a table's headers as the column names, now verify the table has both a date-like header AND an amount-like header. Tables that fail this check are skipped.

**Why:** Some bank PDFs (e.g. Axis Bank) have a non-transaction table (account info: Account No., Branch, IFSC) that appears *before* the actual transaction table. The old code locked onto the first table with any headers, so it picked the account info table and found zero transactions.

**Risk:** Low. Every Indian bank transaction table has `Date/Dt/Tran Date` + `Withdrawal/Debit/Credit/Balance`. Only tables that could fail this: unusual header names from a bank we haven't tested.

**Tested on:** HDFC (scanned), ICICI (digital), Axis Bank (digital), Kotak (digital) — all correct.

**If it breaks for a new bank:** Add that bank's date/amount header words to the regex in `directParseService.ts` lines with `hasDateHeader` / `hasAmountHeader`.

---

### 2. `backend/src/services/extractionService.ts` — direct mode for all PDF types

**Change:** Moved `effectiveMode === 'direct'` check to run *before* the `pdfType === 'scanned'` check. Previously direct mode only worked for scanned PDFs. Now `?mode=direct` sends any PDF (digital or scanned) through Datalab OCR → direct HTML table parse, no LLM.

**Why:** We proved Datalab processes digital PDFs just as well as scanned ones. ICICI (digital, 4 pages) gave 33/33 transactions matching LLM output. Axis (digital, 4 pages) gave 6/6. Same cost per page. No reason to treat digital differently in direct mode.

**Existing routes untouched:**
- No `?mode` param + scanned PDF → still goes through Chandra + Groq LLM (unchanged)
- No `?mode` param + digital PDF → still goes through Groq LLM (unchanged)
- `?mode=direct` → new path, Datalab only, no LLM, works for both types

---

### 3. `backend/test-no-llm-parse.mjs` — same table detection fix

Applied identical table-skip logic to the local test script so it matches production behaviour.

---

## Extraction mode summary

| Trigger | PDF type | Pipeline | LLM? |
|---------|----------|----------|------|
| Default | Digital | pdfjs → Groq | Yes |
| Default | Scanned | Datalab → Groq | Yes |
| `?mode=direct` | Any | Datalab → direct parse | **No** |
| `EXTRACTION_MODE=direct` env | Any | Datalab → direct parse | **No** |

---

## Known limitations / watch out

- Direct mode depends on Datalab OCR quality. If Datalab misreads a header (e.g. "Debit" OCR'd as "Deblt"), the amount header regex won't match and that table gets skipped.
- Multi-page statements where each page repeats the header row: handled — parser updates headers on each occurrence.
- Tables with no `<th>` headers (only `<td>` rows): direct mode won't pick them up. Fallback to content-based date column inference exists but only triggers after a valid transaction table is found first.
- Digital PDFs through Datalab cost the same as scanned (~₹0.38/page at $4/1k pages, ₹96/$). Factor into pricing.
