# Reports: period columns, NZ calendar, exports and Expo workspace

Implemented locally on 7 November2026 (Pacific/Auckland) for #112 and #25.
These are exact server-derived reports, not tax certification or native-device acceptance.

## Reporting contract and calculation

Optional `columns=month|quarter` adds server period columns for profit/loss and
cash flow. Existing top-level statements remain the full-range totals. Omitted
columns preserve the original response shape. Date windows clip to the requested
boundaries, validate real calendar dates and limit column output to120 periods.
The same posted-ledger engine calculates each column from fetched source rows;
no client sums or alternate money formula establish report totals.

`GET /api/reports/options` returns organisation name, timezone, actual local
calendar date, saved financial-year start and the current generated GST period,
plus organisation-scoped account/customer/supplier filter choices. It requires
report reading, not settings access. Date presets use date-only arithmetic and
Pacific/Auckland by default; custom financial-year months and days are respected.
The GST preset needs a confirmed server registration period and is unavailable
otherwise. Comparison periods and account filters retain the server definition;
customer/supplier selectors are explicitly labelled as aging filters.

Web has preset and column controls, a horizontally scrollable table with a
sticky account column, and CSV/PDF export for P&L, balance sheet, trial balance,
cash flow and aging. PDFs retain business, basis, dates, generation time and
warnings; columns use landscape pages. Wide CSV carries every canonical column
and total, with spreadsheet-safe user text and no floating-point conversions.

Expo now reads validated shared DTOs and provides the same six statements,
dates, basis, comparisons, account/aging-party filters, monthly/quarterly values,
and server journal drill-down. Balance-sheet/trial-balance closing-account drill
includes carried history; income/cost drill uses the period. Permission failures,
empty reports, loading, retry and incomplete-source warnings are distinct.
PDF/CSV uses native Print/FileSystem/Sharing; Expo web downloads actual files
through jsPDF/Blob. Cancellation is handled by the existing share helper.
Existing GST preparation and company-tax workspaces remain available.

## Accountant correction: cash P&L

A real Hono/SQLite reproduction found a pre-existing bug: cash basis only
filtered journal reference types. A575 receipt against a1,150 credit invoice
has bank/receivable lines, so the old cash P&L showed revenue0 instead of500;
a230 expense/GST30 made its net result−200 instead of the correct300.
The initial red run is retained; this is not represented as a passing baseline.

Cash reporting now presents **read-only settlement allocations of posted source
components**. Receivable/payable carrying clearances recognise original income,
cost and GST accounts using exact cumulative Decimal allocations. GST never
becomes P&L income/cost. Actual bank and separately posted realised FX remain
intact; manual capital cash is included even when its journal reference is not
a special transaction type. Source and settlement journal identities accompany
derived cash lines. The UI, CSV and PDF explicitly identify this calculation;
no original journal is inserted, replaced or rewritten. The financial tax panel
retains its separately labelled invoice-basis GST calculation.

Credits, refunds, payment reversals and bank reclassification are dated. A bank
reconciliation undo restores the original unmatched generic posting; it does
not pretend that bank cash was refunded. Unlinked AR/AP settlements retain cash
and emit a review warning rather than inventing source income. Legacy foreign
settlements without reviewed carrying snapshots warn explicitly. An unbalanced
or negative-component historical source is rejected for recognition; cash stays
visible with the unallocated control and a warning, rather than manufacturing
income to fill a balancing remainder. This guard has its own captured red/green
regression.

## Independent expected values

| Working paper | Expected / actual assertion |
| --- | --- |
| Small real receipt case | Invoice1,000+150; receipt575; paid expense230/GST30 → cash revenue500, cost200, profit300 |
| Partial sales/bills and capital | October receipt575, bill payment230/GST30, paid expense230/GST30, capital10,000 → revenue500, costs400, profit100, cash10,115 |
| Later corrections in that company | Legitimate credit reverse/reissue and payment reversal workflow → November revenue400, expense0; October remains unchanged; comparison still shows October profit100 |
| Customer credit/refund | Paid invoice1,150 → October revenue1,000; November credit230 alone recognises0; refund115 recognises−100; December refund reversal+100; prior periods unchanged |
| FX carrying | USD50 receipt at reviewed1.65 against original1.60 source → income80 + realised gain2.50 =82.50; corresponding supplier payment cost82.50; net0; later receipt reversal−82.50 |
| Combined bank acceptance | Receipt345 allocated to two invoices gives net income300. Undo later restores unmatched generic income: +45 classification movement, cash movement0; earlier300 unchanged |
| Source rounding | Receipt0.05 from0.10 inclusive supply → income0.04. Later proportional credit shifts0.01 from GST to income; credit reversal gives−0.01 in its own period, preserving October0.04 |
| Unsupported opening debtor receipt | Cash115 remains visible; income0 with an explicit unallocated-source warning |
| Column performance fixture | 10,000 actual SQLite journal lines,12 months, full-range income50,050; each column equals its single-period report on cash and accrual; a local10second regression budget is enforced |

The multi-period supplier-payment reversal case exercises the existing
organisation-bound internal use case plus its posted journal reversal. There
is no public manual supplier-payment reversal endpoint in that test; the earlier
404 fixture attempt is not a claimed HTTP pass. Likewise, an early fixture
attempt hit the valid active-credit guard; the final flow reverses the credit
before correcting the payment, preserving that guard. The first undo working
paper incorrectly expected a cash refund; it was corrected to the actual
classification movement described above, without changing production to match
an invalid financial expectation.

## Local test evidence

Core columns, calendar, options and UI controls have captured failing tests
before implementation. Export row-helper tests were developed alongside their
helper; no pre-implementation red run is claimed for those helper tests.
Scoped current results are collected in this directory. The pre-existing mobile
API request test now supplies a complete canonical fixture rather than `{meta:{}}`;
its original exact URL/period/basis assertions are retained, and the malformed-DTO
rejection has its own test. Complete reports API:9 files /24 tests passed before the final malformed-source
guard; that guard and all cash cases then passed in3 files /8 tests. Contracts:
2 files /6 tests. Web:3 files /9 tests. Mobile:3 suites /13 tests. Scoped lint:
zero errors. The parent report owns final full API/contracts/web/mobile, builds,
strict project types and lint totals.

Actual desktop/phone/Expo browser proof is prepared in
`scripts/issue115-report-proof.mjs`. It creates isolated consultancy books with
accrual revenue1,500−cost300=profit1,200 (April800/May400), assets6,425 =
liabilities225 + equity6,200, cash5,460 and receivables920. Cash P&L is revenue700
−cost300=profit400 (April300/May100). It checks12 columns, actual CSV/PDF bytes
and text, and account drill-down. The first browser pass verified both web finance/export cases and Expo cash400,
but its final cached-query restore waited for an unnecessary network request;
the driver now waits for rendered canonical state. Visual review also caught a
real phone table defect: a224px sticky account plus wide max-content values hid
the initial numeric column. A captured geometry assertion failed (numeric right
528.7 beyond content350). The corrected table has one focusable horizontal
scroller and a144px phone account column beside160px financial values. Final
corrected-build browser verification passed on build `a00595275d99`, with no page errors.
The first numeric column ends at344px within the350px content edge; the labelled
scroller now owns horizontal scrolling. Desktop,390px web and Expo all match
accrual profit1,200 and cash profit400 with actual CSV/PDF downloads.
[Final screenshots, PDFs, CSVs and results](browser/).

Native iOS/Android print/share sheets, keyboard/Dynamic Type interaction and
background/resume remain pending installed-device QA. There is no new native
module or forced runtimeVersion. No deployment or production-data correction
occurred.
