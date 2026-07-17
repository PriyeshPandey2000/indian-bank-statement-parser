# OpenParsed — Roadmap

## Electron Desktop App

### In Progress
- [ ] UI polish (padding, sidebar, buttons)

### Pending
- [ ] Port race condition — block uploads until IPC port arrives from main process
- [ ] Password-protected PDF support — add password input field in upload screen (web app has this, Electron doesn't)
- [ ] userData storage — move `backend/storage/` to `app.getPath('userData')` so data survives app updates/reinstalls
- [ ] Windows cross-platform fix — `env -u ELECTRON_RUN_AS_NODE` is Unix-only, need cross-platform equivalent before Windows build
- [x] `openExternal` URL validation — validate protocol before calling `shell.openExternal` to prevent protocol-handler abuse
- [ ] Race condition on rapid doc selection — use `AbortController` in `selectDoc` so a slow first request can't overwrite a newer selection
- [ ] Retry failed extractions — documents with missing `transactions.json` silently show nothing; need retry action or error state in sidebar
- [ ] Atomic JSON writes — write metadata/transactions to a temp file then rename to avoid truncation on crash
- [ ] App icon — create proper `.icns` (Mac) and `.ico` (Windows) assets in `desktop/build/`
- [ ] Package as `.dmg` — run `npm run package`, fix codesign, test packaged app end-to-end
- [ ] Windows build — VirtualBox VM + `npm run build:win`, test on Windows

---

## Auth & Billing (SaaS)

- [ ] Clerk auth — sign-in gate before upload, user identity
- [ ] Page quota tracking — store pages used per user, block extraction when over limit, show usage in sidebar footer
- [ ] Free tier — 20 pages on signup, no card required
- [ ] Razorpay billing — 3 plans:
  - Starter ₹99 / 100 pages
  - Pro ₹399 / 500 pages
  - Business ₹1499 / 2000 pages
- [ ] Razorpay webhook — update quota in DB on payment success
- [ ] Upgrade prompt — show when quota hit, deep-link to billing page

---

## Data & Storage

- [ ] Cloudflare R2 — store uploaded PDFs remotely instead of local disk (for web app)
- [ ] Proper DB — replace flat JSON files in `storage/` with SQLite or Postgres for user data, quota, history

---

## Product

- [ ] Password-protected PDF — already in web app, port to Electron UI
- [ ] Multi-bank accuracy — test and fix parsing for more Indian banks (SBI, PNB, BOB, Canara, HDFC scanned)
- [ ] Export formats — Excel (.xlsx) in addition to CSV
- [ ] Statement metadata — show account number, bank name, date range in UI header
- [ ] Windows testing — emulate via VirtualBox (free), test full install + upload flow
