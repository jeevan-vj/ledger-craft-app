# Invoice import Phase 4: accounting and GST end-to-end evidence (issue #94)

Branch `feat/invoice-import-phase4-accounting-e2e` (draft PR #100), stacked on Phase 3b (#99). Captured locally on 26 Oct 2026 (NZDT) with Node 24.22.1 against a fresh temporary SQLite database, `APP_ENV=demo`, and OpenAI/xAI keys unset (mock extractor, labelled `provider: mock`). All data is synthetic: org "Crystal Touch Cleaning" (GST registered), customer "Cleancorp Ltd", vendor "Sparkle Supplies Ltd". Nothing was deployed, and no remote database was touched.

## What was added
- `api/src/modules/invoice-imports/invoice-imports-accounting.e2e.test.ts`: one HTTP-level end-to-end test in the existing API harness. It covers all seven scenarios below.
- `local-api-demo.sh` → `local-api-demo.txt`: a real `tsx` API server on an ephemeral port, driven with curl. The script stops only the server it started and removes its temp dir.
- Mobile fix: the "Go back" action on the import read-only denied state (`ImportCaptureScreen`, `ImportReviewScreen`) now uses a link variant of `EmptyState` with the `accentText` token (lime on dark, forest on light) instead of dark green on dark. It has a test (`EmptyState.test.tsx`). The screenshot was **not** retaken: the Phase 3b harness can only regenerate all nine screens at once, so `phase3-mobile/09-read-only-denied.png` still shows the old colour.

## Observed results (`local-api-demo.txt`)
1. **Cleancorp, third-party-issued sale.** Extract gives 200.00 + 30.00 = 230.00, suggested SALES, direction left null. Commit before choosing a direction returns **422 DIRECTION_REQUIRED**. After the explicit PATCH and commit, the invoice is `draft` / unpaid with `thirdPartyIssued=true`, and the **journal is empty**. The normal issue step `POST /api/invoices/:id/send` (no-op mailer in tests) moves it to `sent` and posts **Dr 1200 230.00 / Cr 4000 200.00 / Cr 2200 30.00**.
2. **Sparkle Supplies bill.** 100.00 + 15.00 = 115.00 commits as PURCHASE → `draft` bill, **journal empty**. `POST /api/bills/:id/receive` → `received`, posting **Dr 5000 100.00 / Dr 2150 15.00 / Cr 2100 115.00**.
3. **GST report (invoice basis):** output **30.00**, input **15.00**, net **15.00 payable**.
4. **Trial balance:** 345.00 / 345.00, balanced. After the later scenarios it is 575.00 / 575.00, balanced.
5. **Wrong direction.** A re-imported Cleancorp doc keeps `direction=null` with the suggestion SALES, so a suggestion-only commit returns **422**. Only an explicit `direction=PURCHASE` PATCH commits it as a (draft) bill. Gap: overriding the suggestion needs no extra confirmation.
6. **Paid.** The document importer has no "paid" flag, so the commit leaves the invoice unpaid with balance 230.00. The normal payments route then posts **Dr 1110 Bank 230.00 / Cr 1200 AR 230.00**, and the invoice becomes `paid` with balance 0.00. CSV-import `paid` → real payment was proven in Phase 0 (`phase0/local-api-demo.txt`).
7. **read_only member:** upload, extract and commit each return **403** `invoices.import`. Invoice issue returns **403** `invoices.write`, and bill receive returns **403** `bills.write`.

## Bugs
No accounting, GST-sign, journal-balance, draft-posting or permission bug was found in existing code. The only defect fixed was the mobile contrast issue above.

## Gates vs baseline (Phase 3b)
| Gate | Baseline | Phase 4 |
|---|---|---|
| `pnpm test:api` | 246 passed + 1 skipped | **247 passed + 1 skipped** (62 files) |
| `pnpm test:contracts` | 99 | **99** |
| web tsc (app) | 663 (ceiling 728) | **663**; node config passes |
| web lint | 462 errors / 113 warnings (ceiling 468) | **462 / 113** |
| mobile type-check | pass | **pass** |
| mobile lint | 0 errors / 78 warnings | **0 / 78** |
| mobile jest | 311 | **312** (66 suites) |

The first mobile Jest run, made in parallel with the API suite, had 2 timeouts in unrelated suites (`PublicQuoteScreen`, `InvoiceShareActions`). A clean rerun on its own passed 312/312, and that run is the result in `mobile-gates.txt`.

## Not verified
Real OpenAI/xAI extraction, a real R2 bucket, any remote database or deploy, physical-device mobile runs, outbound email, and a dedicated no-email "Record as issued" action (it doesn't exist; issuing uses `/send`).
