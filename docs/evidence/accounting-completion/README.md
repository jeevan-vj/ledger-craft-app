# Accounting completion: expected and actual verification

This report follows the 6 November business-accounting review. Expected figures
below are independent accounting checks, rather than values inferred from the
screen under test. Targeted regressions and combined gates are recorded
separately. Web main, credit, FX and recovery browser groups pass. Browser-discovered manual
match status and reconciliation-completion defects are corrected; authoritative
ledger summaries allow completion without inventing a closing balance. All recorded final automated gates and supported browser groups pass. Amounts are NZD unless stated otherwise.

The reference business posts net sales1,400/output GST210, an approved expense
200/GST30, an exempt expense50, and a supplier bill300/GST45. It receives1,150
and230 and pays69 against the345 supplier bill. Expected profit is850,
receivables230 and payables276. A reviewed capital opening adds cash/equity5,000
without changing profit or GST.

## Expected versus actual

| Area | Independent expectation | Actual verification and evidence |
| --- | --- | --- |
| Historical correction | Original journal/source remains immutable; add one balanced correction; replay adds nothing; isolate companies | Synthetic real-SQLite HTTP regressions preserve originals, reject stale evidence, enforce company/role boundaries and replay safely. [Audit evidence](ledger-audit.md), including raw before/after JSON. Production data has not been audited or corrected. |
| Historical partial GST | Gross230, rawGST30, confirmed50% claim: input15, cost215, cash230 | Targeted regression verifies15/215/230 after a reviewed additive correction. Ambiguous historical receipts require confirmation. [Expense evidence](ledger/expense-gst-correction.json). |
| Existing supplier payment match | Bill345, payment69, AP276: match withdrawal69 without another expense, payment or GST claim; undo/rematch preserves the payment | API regressions verify unchanged AP276, cost300/GST45 and cash69; duplicate matching is rejected. [Settlement evidence](../business-accounting/completion/settlements.md). Final [web proof](web/results.json) confirms the existing69 match, ledger closing−69/difference0 and completed statement without changing cash6,031/profit850/GST135; Expo also verifies the match. |
| Opening capital | Debit cash5,000/credit capital5,000; profit/GST0; repeated request does not double capital | Reviewed opening and idempotent replay verified against real journals. [Raw evidence](ledger/opening-balances.json); Expo [capital screen](mobile/21-opening-capital-expected5000.png). |
| Invoice-basis GST | Gross sales1,610/purchases625; output210/input75; payable135 | Real HTTP fixture returns135 with the expected source totals. [Tax evidence](tax-and-credit-notes.md); final web dashboard/draft also135, with profit850/AR230/AP276/cash6,031. |
| Payments-basis GST | Receipts1,380/purchases paid349; output180/input39; payable141 | Real HTTP fixture and [Expo draft](mobile/18-payments-gst-expected141.png) return141; final web also verifies180−39=141 and gross1,380/349. Source-linked cash allocation, rather than invoice status, controls inclusion. |
| Reviewed GST adjustments | Output adjustment−15, input+3: output195/input78/payable117; retain source, reason, actor and review metadata | API reload and final web verify195−78=117 and retained server-authenticated metadata. The latest fixture also adjusts gross sales−115 to1,495. Initial Expo screenshot has117 but predates gross-adjustment support and retains sales1,610; it is not final proof of that newer field. [Tax evidence](tax-and-credit-notes.md). |
| Company income-tax preparation | Profit850 + addbacks100 − deductions50 − eligible losses200 = taxable700; confirmed28% gives196 − credits50 = payable146 | Real HTTP fixture and [Expo worksheet](mobile/20-company-tax-expected146.png) verify146 and retained assumptions; final web confirms700 taxable,196 tax and50 credit, with exported PDF evidence. Loss/credit boundary regressions also pass. This is a reviewed company worksheet, not a complete IR4. |
| Foreign invoice settlement | USD100 at1.60 gives AR160; receipt at1.65 gives cash165/gain5/AR0 | Settlement regressions verify160/165/5/0, falling-rate losses, reversal and cent allocation. [Settlement evidence](../business-accounting/completion/settlements.md). |
| Foreign bill settlement | USD100 at1.60 gives AP160; payment at1.65 gives cash credit165/loss5/AP0 | Settlement regressions verify160/165/5/0 and falling-rate gains without changing source GST. Native foreign-bank writes fail closed with422. [Settlement evidence](../business-accounting/completion/settlements.md). |
| Invoice email acceptance | Unconfigured, rejected or unacknowledged transport retains draft; accepted transport receives buyer amount/share link and marks sent | Local HTTP transport/provider acceptance group:14 tests passed. Real recipient inbox delivery remains unverified: no provider secrets and provider host is unavailable under the environment network policy. |
| Credit notes and refunds | Unpaid invoice1,150 less credit230 gives AR920/revenue800/GST120; paid source instead creates customer liability230, refund reduces cash to920 | Real posted HTTP lifecycle verifies these values, reversal, foreign refunds, tax rounding and period allocation. Original source gross stays1,150; a credit is never cash paid. [Credit-note evidence](tax-and-credit-notes.md). |
| Lost-response retries | Same operation/key/body returns the existing result without duplicate cash/journals; changed body conflicts | Targeted API regressions cover manual journal, tax draft, bill payment and required credit/refund idempotency. USD25 partial-payment retry creates one payment/journal; changed amount returns409. Web recovery browser proof passes5 cases with13 screenshots; Expo verifies lost successful responses for invoice, bill, credit and refund, plus initialization retry. |
| Period-end FX revaluation | USD100 carrying160 at1.70 closes at170; next-day reversal restores160; later settlement at1.65 realizes only5 | Real settlement and historical ageing regressions verify170→160→0 for AR/AP, reviewed identities, replay and closing-date guards. [Settlement evidence](../business-accounting/completion/settlements.md), [ageing evidence](historical-aging.md). |
| Historical ageing | Later payments, reversals and credits must not change earlier dated balances | Dated ledger regressions retain October AR/AP170 after November settlement; November reversal restores only subsequent balances. Credit160→120→160 and split bank allocations are verified. [Raw expected/actual reports](ledger/historical-fx-aging.json). Unallocated manual control journals require separate reconciliation. |
| Trial-balance signs | Overdrawn normal-debit bank: opening credit100, closing credit150, signed balance−150; debit normal-credit payable: opening debit100, closing debit150 | Targeted negative-balance regression group passes, preserving debit/credit sides and a balanced trial balance. The final combined API suite passes97 suites/453 tests. Initial mobile report JSON predates this fix and is not its verification. |
| Account-statement opening | Metadata5,000 plus posted opening journal5,000 must report5,000 once, never10,000 | Regression first reproduced10,000; corrected posted-journal authority reports metadata-only0, April closing5,000, May opening/closing5,000. Affected reports group:3 suites/11 tests passed. [Historical report evidence](historical-aging.md). |

## Combined verification status

These are separate executions, not a sum of unique tests. A previous successful
run is not evidence that later edits passed.

| Gate | Recorded result | Final combined status |
| --- | --- | --- |
| Raw web lint |0 errors/119 warnings; no baseline budget or softened rules | Passed with authoritative completion summary |
| Web app and Node TypeScript |0 errors in each configuration | Passed with authoritative completion summary |
| Full web tests |142 suites/786 tests passed | Passed with authoritative completion summary |
| Production web build |0.0.8, hash59b37a1ff3e4 | Passed with authoritative completion summary |
| Full API tests |97 suites/453 tests passed, no skips | Passed after completion-summary fix, no failures or skips; earlier statement/dashboard failures resolved |
| Contracts |34 suites/139 tests passed | Passed after completion-summary fix; strict API/contracts TypeScript0 errors |
| Targeted accounting recovery |3 API suites/13 tests and2 contract checks passed | Included targeted evidence in [audit report](ledger-audit.md); do not add to combined totals |
| Targeted historical reports |3 suites/11 tests passed | See [report evidence](historical-aging.md); included in combined API run |
| Workflow quality enforcement | Exact CI readiness group23 tests passed, including4 strict web-gate tests; separate web sourcemap check passed | Required raw lint and both TypeScript checks replace error budgets; release triggers/deployment policy unchanged |
| Mobile tests and types |115 suites/549 tests passed; strict TypeScript0 errors | Passed after statement completion UI; existing Jest worker graceful-exit warning, no forceExit flag |
| Mobile lint |0 errors/74 warnings; root mobile check0 errors/15 warnings | Passed |
| Mobile exports | iOS, Android and web exports | Passed; bundle export is not native device execution |
| Expo browser workflows | Final browser groups exited0 with no browser errors; lost201 invoice/bill/credit/refund responses, initialization retry and actual statement completion verified | [27 primary screenshots/results](mobile/) and [14 credit/FX screenshots/results](mobile-credit-fx/) |
| Web recovery browser |5 cases passed,13 screenshots | [Recovery evidence](recovery/); screenshots refreshed with final framing |
| Web credit browser | Passed | [Five screenshots/results](credit/) copied |
| Web FX browser | Passed with zero browser errors: desktop AR and phone AP160→170→160→settlement165, gain/loss5 | [Six screenshots/results](fx-web/); run before final one-line manual-match adapter fix, no build hash claimed |
| Web main browser | Passed against59b37a1ff3e4, no browser errors: supplier match confirmed69, ledger closing−69/difference0, actual UI completes; business cash6,031/profit850/GST135 unchanged | [13 screenshots,2 PDFs and results](web/) |
| Deployment packaging | Final Worker and Pages Wrangler dry runs exited0 after summary fix | No resources deployed |
| Native iOS/Android | No actual native execution | Blocked: Linux has no Xcode, Android SDK/emulator, attached device or KVM |

Browser groups were executed separately. Mobile primary proof includes the
updated authoritative statement-completion panel and its final focused browser
run. Credit/FX and recovery groups predate unrelated later adapter/summary
changes; no common browser build hash is claimed. Main web proof passed against
59b37a1ff3e4. All293 local web source files embedded in that final build's
sourcemaps were compared with current source and match exactly.

The Expo artifacts exercise real Hono/SQLite in Chromium, not actual native
runtimes. Earlier screenshots/results were superseded by the final copied
mobile groups. Review individual recorded fixture dates/figures: the earlier
reviewed-GST capture predates gross-adjustment support, and earlier overdraft
screens predate the trial-balance sign fix. Neither establishes those newer
behaviors; their API regressions and latest focused browser proofs do.

The final backend run also verifies unallocated control balances explicitly:
a posted manual AR5,000 appears as an unallocated5,000 with no invented
customer invoice. Unfiltered accrual ageing reconciles to the control ledger,
while dated customer/vendor buckets retain only defensible document links.
The dashboard regression's old operational AR70.05/AP40.02 expectation was
replaced with authoritative posted-ledger AR15.66/AP5.22 and an explicit
unallocated row. The UI warns about that reconciliation requirement.

## Scope and unresolved external verification

No production database corrections, real-recipient messages, deployment or IRD
submission have been performed. Historical audit fixtures are synthetic. IRD
filing acceptance and current legal/tax-policy validation have not been tested.
Loss/credit eligibility and the explicitly confirmed company tax rate require
accountant review; the worksheet does not implement all IR4 schedules,
provisional tax or imputation rules.

Foreign source documents support reviewed NZD settlements and AR/AP revaluation.
Native foreign-bank statement valuation remains unsupported and rejects writes
with422. Unverified historical FX snapshots require review rather than invented
rates. Foreign payments-basis GST uses reviewed carrying-method amounts and
explicit warnings; it does not treat FX gains as GST. Credit notes support
standard, zero-rated and proportional allocation; unsupported non-proportional
mixed-tax allocation requires a manual workflow.

The Akaunting feature catalogue reports6/25 available,17 partial and2 missing.
A successful report-generation command does not establish full feature parity.
