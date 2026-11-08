# Independent second-month and year-end review

Verdict: **PASS**

Blockers: none. Should-fixes: none. Nits: none.

Reviewed: `a40f5a34002639236640e2fc5d5d3e4a81348840` against latest main `ff7d561`.

Auto-merge: **not eligible**. This changes production accounting-report output and its shared contract, so conservative `risk:high` and human review/merge apply. The diff contains494files/57,981text lines, chiefly retained verification artifacts. Hosted CI and PR-head identity are not independently established through GitHub in this environment. Installed native-device acceptance remains pending. This local fixed-head PASS is not a deployment, native-release clearance, GitHub approval or merge recommendation.

## Independence and scope

The reviewer did not write the production changes, tests, drivers or frozen working papers. Only this review document is reviewer-owned. I read the repository reviewer, verification and invariant instructions and `docs/PIPELINE.md`; I did not push, approve, publish a GitHub review or merge.

The review covers the authorized continuation from closed October into November, March31 fiscal cutoff and April opening; independent accounting reconciliation; real web/Expo operations and downloads; and the narrowly scoped accumulated-earnings disclosure found during the walkthrough.

## Accounting and source review

- Confirmed the frozen paper hashes: main `44569ca2371a1e2495eb966f1f7a6f400dde48b805d865aa56aabca80b9f409e`, supplement `d56efc7db7d26a37b076f41f70b08a8a12827bd013a91b654ead1be66c2f6ca5`, nil-GST paper `5516099a1b4e051f31face0842dc615a328fc9301be69864fed5e206f68b4012`.
- Independently Decimal-summed every prescribed November and April economic journal from the frozen October opening roles. All journals balance, all9role balances reconcile, and closing TB totals are14,370 and14,715. Economic turnover4,140/575 is distinct from net-zero import/match turnover. November assets12,670 = liabilities770 + equity11,900; April assets12,915 = liabilities915 + equity12,000.
- November profit400, March FY profit1,900, April profit100 and cumulative April earnings2,000 follow the prescribed source activity. Equity counts capital10,000, prior1,900 and April100 once. Dated P&L resets without requiring a synthetic nominal-account closing journal.
- Reviewed real authenticated HTTP/SQLite tests: no Drizzle mocks or direct economic row seeding; later October settlements; November partial receipt, unpaid-balance credit, received bill/part payment and paid expense; actual bank imports/matches; GST drafts; fiscal cutoffs; all9opening/closing roles; historical report/journal/GST preservation; monthly/quarterly and both-basis fiscal comparisons.
- Overpayment returns400 `PAYMENT_EXCEEDS_BALANCE` with complete payment/journal lists unchanged. Exact accepted receipt retries return the same response and unchanged journals; changed bodies return409. No unsupported overpayment-wallet behavior is claimed.
- The presentation defect is resolved canonically: optional exact-money `balanceSheet.accumulatedEarnings` preserves old responses, while the API serializes the **existing** cumulative-income amount already used in equity. The equity formula, stored postings, journal rows and totals are unchanged. Both clients display the server field directly and explicitly say `included in equity`. Shared PDF/CSV rows reuse it without float conversion, a fictitious ledger account or an unsupported prior/current split.
- Test-first red logs fail on the absent contract/export row, absent real API disclosure and absent web/mobile display. Green assertions cover positive/negative earnings, legacy omission, zero on web and exact export text above JavaScript's safe-integer range. The optional idempotency-key test-helper argument preserves existing default behavior.
- No migrations, auth policies, production date guards or provider integrations changed. The synthetic clock module is explicitly loaded for disposable acceptance services and is not imported by production source.

## Artifact and command review

I independently opened all3 final web and all3 final mobile archives: each has14members and all13member SHA-256/length checks pass (78checks). For both platforms I independently summed9role balances from each period's downloaded raw GL plus frozen opening sides (54role checks); technical Other Income nets to zero. November/March/April earnings1,900/1,900/2,000 and equity11,900/11,900/12,000 agree with the paper. Both FY packs retain4nil GST drafts at0, not filed confirmations.

I inspected actual April balance-sheet screenshots, extracted the bridge label/amounts from the3final mobile PDFs and CSVs, and rendered the mobile April PDF to check that the new row fits. Final web artifacts on build `758b05c50483` include the same canonical row. All6reports for each period were downloaded again after the display-only change without replaying economic operations. Evidence separates earlier business-operation build `fa674d007c69` from the final read-only report refresh; the source-map identity records368matching current source contents.

Final retained local command evidence reports:

| Gate | Result |
| --- | --- |
| Web Node22 lint/types/build | exit0;0lint errors/120existing warnings; final build758b05c50483 |
| Web tests |171suites/885tests pass |
| API Node24 full suite |144suites/626tests pass |
| Latest-main Stripe fixture delta |10tests pass separately; full API run began before this test-only base update, with production source unchanged |
| Contracts/types |48suites/169tests pass; API/contracts types exit0 |
| Mobile Node20 |150suites/677tests pass; types/lint exit0 with74existing warnings; npmci and both iOS/Android Hermes exports exit0 |
| Readiness/source-map/parity |23+3tests pass; report command exits0 with deferred scope visible |
| Actual local Worker/types/dry run |1integration test and both checks exit0; no deployment |

The compressed final API log independently records144/626 passing. Command/exit metadata, actual screenshots/downloads, paper hashes and `git diff --check` agree with the fixed-head evidence. Browser phases retain unexpected-error checks; the final earnings refresh preserves all preexisting financial fields and checks the new field separately.

## Limits retained in the result

The September30 bank/capital opening10,000 is an imported opening component, not proof of a real April–September capital cash contribution. Supported October–March cash flow is10,000 +3,795 receipts −1,840 payments/refund =11,955. Full-FY ledger footing is mechanically0 +13,795 −1,840 =11,955, but missing pre-October cash/bank history prevents claiming a complete statutory FY cash-flow statement. The archive's missing-history warning remains intact.

Completed statements cover October, November, zero-activity December–March and April with5/5/0/1matches. The April fiscal period remains open, so its archive correctly says working pack. Web's reviewed owner reopen/reclose for4nil GST drafts preserves financial sections and existing policy; mobile prepares them before first March close. Monthly drafts and the annual working paper are not IRD filings; no filed-confirmation warnings were suppressed.

Expo web is the actual mobile platform exercised. Installed Android/iOS share-sheet success/cancellation, lifecycle, keyboard and native date-picker behavior remain **device-qa-pending**. Native bundles and local tests do not clear that gate. No real provider send, production deployment, tax submission or native publication occurred. #114 remains parked.
