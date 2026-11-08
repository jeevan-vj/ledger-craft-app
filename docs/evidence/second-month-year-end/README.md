# Second-month close and NZ year-end rollover

Verified locally on8November2026 from merged main `8f6bb68` (#170), with final main base `ff7d561` (a subsequent Stripe test-fixture-only change, separately rerun), using fresh synthetic web and mobile companies and separately frozen Decimal working papers. The application/browser acceptance clock is explicitly May1,2027 so November30 and March31 cutoffs can be exercised without weakening the production future-date guard. SQLite's default wall-clock audit timestamps still reflect the runner date. No production data, deployment, provider sends, native publication or IRD submission occurred. #114 remains parked.

## What changed

The business flow already reconciled correctly. This walkthrough found a presentation gap: equity included accumulated earnings, but the balance-sheet account table showed owner capital without an explicit earnings bridge. The API now exposes the **existing** cumulative-income amount as optional `balanceSheet.accumulatedEarnings`. Web, Expo, CSV, PDF and the ZIP's shared export rows show **Accumulated earnings (included in equity)**. The amount is already part of equity; it must not be added again. No new formula, posting, journal, migration or automatic fiscal closing transfer was introduced. Older API responses remain supported without inventing a client-calculated value.

Test-first evidence: the contract/export tests failed for the missing field/row, the API test failed for missing1,900, and web/mobile tests failed for the missing disclosure. The same tests pass after the narrow fix, including negative earnings, zero on web, legacy omission and exact decimal text larger than JavaScript's safe integer range. The clients display the canonical value directly.

## Expected versus actual

| Control, NZD | November | March31 year end | April new year |
| --- | --- | --- | --- |
| Closing trial balance, each side | 14,370 | 14,370 | 14,715 |
| Assets | 12,670 | 12,670 | 12,915 |
| Liabilities | 770 | 770 | 915 |
| Equity | 11,900 | 11,900 | 12,000 |
| Accrual profit for selected period | 400 | 1,900 FY | 100 |
| Closing cash | 11,955 | 11,955 | 12,185 |
| Receivables / payables | 460 /230 current | 460 /230 over90 | 460 over90 /345 mixed |
| Accumulated earnings included in equity | 1,900 | 1,900 | 2,000 |
| Invoice-basis GST for November /April | 60 | Four nil monthly drafts | 15 |

Both real web and Expo UI companies match the independent figures. November carries October closing sides forward, settles October AR920 and AP575, then records the new invoice, part receipt, credit, received bill, part payment and paid expense. Five source matches reconcile the statement from11,380 to11,955. A zero-activity December–March statement carries11,955 with zero matches, and April's existing230 receipt is matched once to reach12,185. Technical import/match legs remain auditable and net to zero; they are not additional income or GST.

March retains the unpaid November AR/AP and1,900 earnings. April's P&L resets to200 revenue less100 expense, while total equity preserves prior1,900 plus April100 exactly once. Stored nominal ledger accounts are not zeroed by a fiscal cutoff. Correctly dated reports and optional explicit earnings disclosure are distinct from fabricating a closing journal.

All original financial fields remain unchanged after the additive earnings disclosure. Historical October/November statements, journal records, GST snapshots and their source identities remain unchanged after later transactions. API tests also verify both-basis fiscal comparisons and month/quarter columns. Overpayment1,150.01 against a1,150 invoice is rejected with **no payment or journal write**; it is not silently stored as customer credit. Exact lost-response receipt retries do not duplicate postings, and changed retry bodies conflict.

## Papers, screenshots and downloads

- [Frozen main paper](expected.md), [exact JSON](expected.json), SHA-256 `44569ca2371a1e2495eb966f1f7a6f400dde48b805d865aa56aabca80b9f409e`.
- [Cash-flow/bank supplement](supplemental-paper.md), [exact JSON](supplemental-paper.json), SHA-256 `d56efc7db7d26a37b076f41f70b08a8a12827bd013a91b654ead1be66c2f6ca5`.
- [Four nil GST expectations](nil-gst-paper.json), SHA-256 `5516099a1b4e051f31face0842dc615a328fc9301be69864fed5e206f68b4012`.
- [Web gallery and actual downloads](web/README.md); [Expo gallery and actual downloads](mobile/README.md).
- [Real HTTP/SQLite API acceptance and red/green evidence](api/README.md).
- [Independent review](independent-review.md), [runtime/clock identity](runtime.json), [CI command/exit evidence](checks/commands.json).

Each platform downloads six PDFs and six CSVs for each of November, March and April, plus three ZIPs. Every ZIP has14members and all13member hashes/byte counts verify. All nine ledger roles reconcile independently from raw GL and frozen opening sides for all three periods. The final exports include the canonical earnings bridge with unchanged equity. Actual PDF text and figures are checked; the independent reviewer also rendered the final mobile balance-sheet PDF to inspect its layout.

Web business operations ran against production build `fa674d007c69`. After the display-only fix, read-only report verification regenerated all November/March/April screenshots and downloads on final production build `758b05c50483`;368source-map contents match current source. No economic operation was replayed. The mobile read-only refresh likewise checks every original field and the newly exposed amount independently. The coordinated API restart uses the same database; both companies' books remain intact.

## GST and fiscal qualifications

Monthly registration still requires nil return preparation for zero-activity months. All four December–March nil drafts are retained. Web demonstrates an owner-controlled reopen from December1, prepares the nil drafts, then recloses March31 without changing financial totals. Mobile prepares them before its first March31 close. Existing policy requires reopening to create a new draft in a closed fiscal period; no guard was bypassed. October225, November60 and April15 remain drafts, **not filed confirmations**.

The April pack is a working pack because the fiscal cutoff is March31; its bank statement is reconciled. The year-end pack spans April–March, but the imported September30 opening balance does **not** establish the earlier bank history. October–March operating cash is supported:10,000 +3,795 receipts −1,840 payments/refund =11,955. The full FY ledger mechanically shows initial-equity10,000 plus operating1,955; that is not proof of a real in-year funding contribution or a complete statutory April–September cash-flow statement. The manifest's missing-history/coverage and not-filed warnings are retained.

The UI shows one accumulated-earnings bridge; it does not claim separate posted retained/current-year equity accounts. The paper independently establishes prior1,900 plus current100. No statement here is a production deployment or tax filing acceptance.

## Checks and limits

Final web Node22:171suites/885tests, app/Node typechecks, lint0errors/120existing warnings and production build pass. Contracts Node24:48suites/169tests and types pass. Mobile Node20:150suites/677tests, types, lint0errors/74existing warnings, npmci, iOS and Android Hermes exports pass. Release-readiness23tests and source-map3tests pass; Akaunting parity report exits0 with tracked deferred work visible. Final Worker local integration, Worker types and dry-run bundle pass; no deployment occurred. Final API Node24:144suites/626tests pass. Main advanced only a Stripe date fixture while this full run was in progress; the updated file separately passes all10tests on final baseff7d561.

Installed Android/iOS device or simulator acceptance remains **device-qa-pending**: this Linux environment has no adb/emulator/xcrun or KVM. Expo web is the actual verified mobile UI; platform bundle exports and unit tests do not establish native keyboard, date picker, lifecycle or share-sheet behavior.

Harness corrections are documented separately from production fixes. They addressed fixed-clock animations/gesture timestamps, waiting for loaded forms, outside-month calendar days and ambiguous identical GST labels; the app's date/overpayment validation remained intact. Final state and source IDs are audited to ensure that retries did not duplicate economic records. Authentication/session files remain under `/tmp` and are excluded from evidence.

Reproduction uses `scripts/second-month-acceptance-clock.mjs` only in the disposable local API process, `scripts/second-month-web-close-proof.mjs`, `scripts/second-month-web-report-refresh.mjs`, `scripts/second-month-mobile-close-proof.mjs` and `scripts/verify-second-month-artifacts.py`. Existing verify skills cover the workflow; no second verification policy skill was added. Financial report output/contract paths make this `risk:high`; human review/merge is required and no auto-merge is claimed.
