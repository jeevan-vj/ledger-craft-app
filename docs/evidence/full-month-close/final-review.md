# Final independent review — immutable implementation and evidence

Verdict: **PASS for local source correctness and recorded acceptance.**

Blockers: **none** in the reviewed implementation and local evidence. Should-fixes: **none**. Native-device checks, real provider/IRD operations and remote GitHub checks remain outside this local acceptance and are explicitly disclosed; they are not represented as completed.

Reviewed: `77c560b3a192ea6630331095c8c37204328a8b99..5353e0a81f4db8b09ae52f720b49d2d7972997e7`. This replaces the earlier provisional working-tree review after its evidence gates were completed. The reviewer did not author the production changes, commit, push, approve, label or merge. This document's later report-only commit does not change the reviewed implementation; any further source delta requires review.

Auto-merge: **not eligible**. Risk: **high**, including the CODEOWNERS expense tax path and large scope. Human review is required. GitHub API access returned Forbidden; PR head, CI status, remote threads and remote publication cannot be confirmed. This is a local verdict, not a recommendation that remote merge gates have passed.

## Acceptance and correctness

The requested close is explicitly opening balances → invoices → receipts → bills/expenses → credits/refunds → bank reconciliation → GST, with independently reconciled trial balance, balance sheet, P&L, cash flow and aging on web and mobile.

- The independent paper was frozen before application output. Python Decimal checks of the retained API artifact match closing TB13,680 each, profit1,500, assets12,480/liabilities980/equity11,500, cash opening10,000/inflow2,300/outflow920/closing11,380, AR920/AP575, all aging buckets, invoice GST225 and five matches/difference0. See `accountant-review.md`.
- `PaymentForm.tsx` preserves the chosen local calendar date for both payment creation and foreign settlement-rate lookup. The Auckland regression specifically exercises a day that UTC conversion would shift.
- `SmartDatePicker.tsx` adds a web-only custom-date path, validates exact round-tripping calendar dates and minimum dates; native pickers retain their existing paths. Invalid and historical-date behavior is asserted.
- `reports.engine.ts` nets only cash legs connected to imported statement/reconciliation actions. Persistent transaction/action/journal identities cover undo and rematch; dates stay attached to rows, monthly columns reuse the map, and original GL/TB lines remain intact. Unmatched imports remain present. Source receipts and customer refunds retain their gross economic amounts. The map is organisation-scoped in the repository.
- Closing TB totals are calculated with the existing Decimal helper, added optionally to the contract for old response compatibility and shown independently from period turnover on web/mobile. Export columns explicitly separate opening, period and closing debit/credit sides. No frontend recomputation of money was introduced.
- Refund matching requires a completed refund with a posted journal, organisation scope, exact amount, outgoing direction and matching bank. Existing match protection includes the refund journal identity. Undo reverses reconciliation accounting while leaving the original refund intact. Tenant isolation, wrong bank/direction, reuse, retry and undo/rematch have behavioral API coverage.
- Mobile expense GST: enabling tax after loading a pending expense with zero rate restores the existing NZ15% default only when the saved rate is zero. Existing positive rates are retained. No new arithmetic/totals helper is introduced. The red/green component evidence is retained and the complete fresh-company UI walkthrough now passes.


## Final delta review

The Hono conversation API becomes the default while retaining explicit `VITE_CONVERSATIONS_API=false` opt-out. Requests use the existing same-origin authenticated API path; no second session or client credential is introduced. Regression coverage asserts default/true/false and existing conversation behavior.

The web cash-flow account table now presents net movement rather than raw journal debit/credit turnover, consistent with the corrected economic cash-flow totals. It does not change ledger accounting. Eight mobile fixes are covered by retained red/green records: web date entry, closing TB labels, refund selection, equal-receipt source date/reference identity, expense GST activation, browser task storage, landscape TB PDF, and empty-string import rendering. Browser storage is confined to a non-sensitive task-dismissal preference; native SecureStore remains in use. The import conditional removes a raw empty text child without changing import data. Native and browser PDF paths retain their platform implementations with a landscape layout for TB; no new totals path or dependency is introduced.

The bootstrap/AGENTS/architecture additions accurately label this local acceptance and its setup/device/filing limitations. `.gitattributes` marks retained PDFs and compressed logs as binary and does not alter runtime behavior.

## Independent final evidence checks

The reviewer independently parsed both `web/results.json` and `mobile/actual-reports.json` with Python Decimal and compared them to the pre-observation frozen `expected.json`. For both companies, P&L, gross balance-sheet controls, closing TB debit/credit sums and new totals, gross/net cash flow, every aging bucket/unallocated control, and invoice GST agree exactly. The mobile raw general ledger was separately summed from September30 through October31 by all nine frozen account roles; all match. The completed statements have five matches and zero difference; mobile bank lines are all reconciled and source dates agree with match proof.

| Control | Web and Expo web observed | Independently expected |
| --- | ---: | ---: |
| Closing TB debit and credit, each | 13,680.00 | 13,680.00 |
| Accrual profit | 1,500.00 | 1,500.00 |
| Assets / liabilities / equity | 12,480 / 980 / 11,500 | 12,480 / 980 / 11,500 |
| Cash opening / inflows / outflows / closing | 10,000 / 2,300 / 920 / 11,380 | 10,000 / 2,300 / 920 / 11,380 |
| Receivables / payables, all current | 920 / 575 | 920 / 575 |
| Invoice GST output / input / payable | 405 / 180 / 225 | 405 / 180 / 225 |
| Statement matches / difference | 5 / 0 | 5 / 0 |

The full verification table now records required Node versions, commands, exit0, summaries and linked logs. Retained output confirms web167 files/870 tests, API135/600, contracts44/162 and mobile146/658: **2,290 tests** across those four suites. Lint errors are zero with disclosed120 web and74 mobile warnings. Typechecks, builds, readiness/Worker checks and iOS bundle export are recorded as successful. The reviewer inspected the records rather than claiming to have independently rerun every full suite.

Source identity checks independently recomputed all359 web source hashes and all mobile metadata source hashes against the committed files. The uncompressed API log SHA matches its archived integrity record. All13 mobile export-file hashes independently match verification.json. All retained mobile phase records have zero page and unknown console errors; web phase records likewise contain no unexpected errors. Expected initial unauthenticated/onboarding diagnostics remain visible.

Both web and mobile TB PDFs were independently rasterized and visually inspected. All eight columns, period totals14,605 and closing totals13,680 are present without clipping. Web portrait wraps headers; mobile landscape fits the wider table. Inspected CSV/PDF consumers dynamically handle the eight columns; no hard-coded five-column debit/credit assumption was found. Export checks retain actual downloads and extracted amounts rather than only PDF signatures. Native print/share code is tested and builds, but native share-sheet execution is still pending.

## Scope and evidence honesty

API acceptance is labelled authenticated Hono/SQLite. Both browser drivers operate real application screens against local services; report responses are not stubbed. Web runs the actual built artifact. Expo web runs Chromium390×844; it is not described as an installed iOS/Android app. The mobile chart-of-accounts creation gap is explicitly recorded as a setup-only API exception for three accounts; opening and operational financial transactions use UI. Read-only API checks verify the resulting records. The refreshed company replaces the earlier diagnostic failed expense run. The later GST screenshot capture after dependency reinstall is labelled read-only.

The required Mobile screenshots/device-check section now lists installed iOS/Android checks pending. An iOS bundle export is correctly described as a build check. The GST record is a retained draft with no IRD submission or acceptance claim. The month-close scenario is NZD, standard15%, full input claim and synthetic; it is not statutory assurance or a company-wide fiscal-period lock. Shared report `trialBalance.balanced` retains its existing period-equality semantics, while closing totals are separate. Period turnover14,605 must not be interpreted as closing TB13,680.

## Security and invariants

Existing authenticated organisation scoping is retained for refund and action lookup. No new public token route, secret, hosted Supabase access or authentication session is introduced. Monetary accumulation uses the existing Decimal helper and decimal text; no SQL SUM/REAL, JS-float accumulation, duplicate invoice totals helper or applied-migration edit was found. Retry/reuse and source immutability remain covered by behavior assertions. No warning ceiling or failing assertion was deleted to achieve green checks.

## Reviewed production source files

- `api/src/modules/reconciliation/existing-posting.repository.ts`
- `api/src/modules/reconciliation/existing-posting.ts`
- `api/src/modules/reconciliation/reconciliation.repository.ts`
- `api/src/modules/reconciliation/reconciliation.service.ts`
- `api/src/modules/reports/reports.engine.ts`
- `api/src/modules/reports/reports.repository.ts`
- `api/src/modules/reports/reports.service.ts`
- `mobile/src/components/banking/ExistingSettlementPanel.tsx`
- `mobile/src/components/reports/FinancialReportWorkspace.tsx`
- `mobile/src/components/ui/SmartDatePicker.tsx`
- `mobile/src/features/reports/model/financialReportHtml.ts`
- `mobile/src/features/reports/model/financialReportShare.ts`
- `mobile/src/features/reports/model/financialReportShare.web.ts`
- `mobile/src/screens/banking/BankStatementImportScreen.tsx`
- `mobile/src/screens/expenses/ExpenseEditScreen.tsx`
- `mobile/src/screens/main/homeTaskStorage.ts`
- `packages/contracts/src/reconciliation.ts`
- `packages/contracts/src/report-export.ts`
- `packages/contracts/src/report.ts`
- `src/components/payment/PaymentForm.tsx`
- `src/components/reconciliation/ReconciliationWorkspace.tsx`
- `src/features/conversations/api/conversationsApi.ts`
- `src/features/reconciliation/api/reconciliationApi.ts`
- `src/pages/FinancialReportsPage.tsx`
- `src/services/reconciliationService.ts`
- `src/types/reconciliation.ts`
