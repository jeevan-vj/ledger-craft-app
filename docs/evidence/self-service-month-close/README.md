# Self-service month close — 8 November 2026

This branch adds self-service chart setup on mobile, company-wide accounting period protection and an accountant close pack on web and mobile. Verified locally against synthetic NZ companies for October 2026. No production or real financial data changed; no provider sends, filing, deployment or native publication occurred. #114 remains parked.

## Expected versus actual

The independent Decimal working paper was frozen in the merged prior walkthrough: [expected.json](../full-month-close/expected.json). Both fresh companies repeat that business case through UI operations, including all chart setup. Authenticated read-only requests and downloaded source GL independently check the results. No API fixture writes substitute for business UI operations.

| Control | Independent expectation | Web | Expo UI |
| --- | --- | --- | --- |
| Closing trial balance, each side | 13,680.00 | Pass | Pass |
| Assets = liabilities + equity | 12,480 = 980 + 11,500 | Pass | Pass |
| Accrual P&L | 2,700 − 1,200 = 1,500 | Pass | Pass |
| Cash | 10,000 + 2,300 − 920 = 11,380 | Pass | Pass |
| Receivables / payables, all current | 920 / 575 | Pass | Pass |
| Invoice-basis GST | 405 − 180 = 225 | Pass | Pass |
| Cash-basis profit | 1,900 − 700 = 1,200 | Pass | Pass |
| Statement matches / final difference | 5 / 0.00 | Pass | Pass |
| Close → reopen → reclose | Oct31 → Sep30 → Oct31, revision3 | Pass | Pass |
| Reports unchanged by close/reopen | Seven financial sections identical | Pass | Pass |
| Accountant ZIP | 14 members, all13 SHA-256 checksums valid | Pass | Pass |

Amounts are NZD. Cash metadata opening values do not create journals: a reviewed balanced opening journal posts 10,000 once. Bank matches do not duplicate income or GST. All nine ledger role balances were independently summed in integer cents from downloaded journal lines plus the known opening journal. Period turnover14,605 differs from closing trial-balance totals13,680 because technical import/match legs remain auditable.

## Reviewable evidence

- [Web screenshots, reports and downloads](web/README.md): 10 actual Chromium UI phases against the production build `d5251ad28f70`, desktop and390px phone viewports. Six report PDFs and CSVs were actually downloaded; PDFs opened and text extracted.
- [Mobile screenshots, reports, locks and downloads](mobile/README.md): 12 actual Expo UI phases, including a historical non-bank expense/equity journal rejected409 without creating a journal. Six report PDFs/CSVs plus GST PDF and ZIP downloaded and inspected.
- [API period guard map and regression evidence](api/period-locks.md), including source-date paths, role/scoping rules, concurrency, retry behavior, bank-cutoff independence, migration preservation and actor-deletion retention.
- [Close-pack API behavior](close-pack-api/README.md): canonical reports, permissions, member checksums and honest incomplete/stale-period warnings.
- [Independent review](independent-review.md): findings and resolutions; final review status is stated in that report.

The pack is full-company accrual NZD for the selected dates, even when the visible report uses narrower filters or cash basis. It includes canonical CSV/JSON, general ledger, bank reconciliation, GST records, cutoff state and a manifest/readme. Individual UI report PDFs remain separate downloads. GST is a retained draft, **not an IRD filing**; the manifest explicitly warns that no filed confirmation exists.

## Native acceptance still required

This Linux environment has no installed Android/iOS emulator, simulator or attached device. Both native platform bundle exports, mobile tests, types and lint pass; Expo UI verification does not establish installed-device behavior. Device share-sheet success/cancellation, app lifecycle, keyboard and native date-picker walkthrough remain a release gate.

The API was restarted on the same database before mobile cutoff/archive proof and before the new web company was created. Migration0036 was then applied without resetting the mobile books; its dedicated realSQLite regression verifies retained audit/event/journal content. It removes only the actor-to-login foreign key so an accountant can delete their login without deleting audit evidence.

## Regression checks

Web Node22: 171 suites /881 tests pass, typechecks pass, lint0errors/120warnings, production build passes. Contracts Node24:47 suites /167 tests pass; API/contracts types and migration verifier pass. Mobile Node20:150 suites /674 tests pass, types pass, lint0errors/74warnings, iOS and Android exports pass. Release-readiness23tests and web-source-map3tests pass; Akaunting parity report command exits0 (tracked deferred features remain visible). Full commands/output are retained in [checks](checks/) and [mobile checks](mobile/checks/).

TDD evidence includes bank contract/API rejection before implementation, web missing setup/period/pack controls, account retry/company-scope failures, CORS header failure, closed source-posting/reversal/import regressions and the actor-deletion regression. Red logs are intentionally failing pre-fix observations; green and final full-suite logs supersede them. The final API run also corrects an existing Stripe test fixture: its credit date follows the actual webhook payment date rather than hardcoding yesterday. The production credit/payment chronological guard stays intact.

Accounting, auth-scoping and additive migrations make this **risk:high**, requiring human review/merge; no auto-merge eligibility is claimed. Installed-device acceptance remains **device-qa-pending**.

Final API full run: **142 suites /623 tests pass**. The subsequently added execution-only Worker migration helper has **2 additional targeted tests**, both passing against the immutable SQL sequence; actual Durable Object execution also passes all37migrations. Final API/contracts types and web lint were rerun after that helper change. The full API log is retained compressed with an uncompressed SHA-256 in `checks/`. The pre-final API run is retained for the date-fixture and paid-invoice-delivery regressions; it began before the delivery fix and is superseded by the green run. Web/mobile production UI source was unchanged by the Worker-only fix.

After migration0036 and the final API restart, [mobile readback](mobile/post-migration-readback.json) confirms every financial section and all three audit events remain unchanged.

The actual Cloudflare Worker check caught a bootstrap defect hidden by Node SQLite: a trailing Drizzle `statement-breakpoint` comment is rejected as an empty statement by Durable Object SQL. The runner now removes only generator separator metadata at execution time. Original migration bytes/checksums and recovery bookmarks remain unchanged. The original Worker failure and fresh all37migration success are retained in the API evidence; no applied migration was rewritten.

[Actual Cloudflare Identity/Ledger proof](worker/README.md) passes after the runner fix: bank-ledger setup, opening, expense, completed bank match, GST draft, close/reopen/reclose, scoped conflict/replay and cross-company isolation. Its ZIP14members/13checksums verify; Worker types and dry-run bundle exit0. This deliberately smaller supplementary case reconciles cash9,770, loss200 and GST credit30; it is distinct from the full October web/mobile company above. No deployment occurred.
