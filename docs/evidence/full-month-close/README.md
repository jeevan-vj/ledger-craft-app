# October 2026 full month close

Synthetic NZ services businesses completed the October close through the real
Hono/SQLite app. The independent accountant froze the prescribed journals and
Decimal calculations before viewing application results. This is local acceptance,
not a production-data correction, IRD submission or installed-device certification.

## Expected and actual

Amounts are NZD. Reports use 1–31 October, with opening balances posted as at
30 September. The underlying books include two invoices, partial/full receipts,
a supplier bill and half payment, an approved paid expense, an unpaid-invoice
credit, a paid-invoice credit and its refund. Five imported statement lines match
the existing transactions without creating a second sale, settlement or GST claim.

| Reconciliation | Independent expected | Actual web / Expo / API |
| --- | --- | --- |
| Closing trial balance | Debits 13,680; credits 13,680 | Matches, including each account's closing side |
| Balance sheet | Assets 12,480 = liabilities 980 + equity 11,500 | Matches |
| Accrual P&L | Revenue 2,700 − costs 1,200 = profit 1,500 | Matches |
| Cash recognition P&L | Revenue 1,900 − paid costs 700 = profit 1,200 | Matches |
| Cash flow | Opening 10,000 + receipts 2,300 − payments 920 = closing 11,380 | Matches |
| Receivables aging | Client A 920 current; client B nil | Matches, control and buckets reconcile |
| Payables aging | Supplier 575 current | Matches, control and buckets reconcile |
| Bank statement | Five matches; closing 11,380; difference nil | Completed, five correct source identities |
| Invoice-basis GST | Output 405 − input 180 = payable 225 | Prepared and retained draft matches |
| Payments / hybrid GST | Payable 180 / 300 | Independently asserted API cases and retained actual responses |

The balance sheet presents separate GST controls: input GST asset 180 and output
GST liability 405. Netting those controls gives assets 12,300 and liabilities 800,
with the same equity 11,500 and net GST payable 225. This distinction was frozen
from the chart's static classifications before reading results.

Period journal turnover is **14,605** each side after statement imports and
matching corrections. It is not the closing trial balance. Web, Expo and exports
now distinguish period activity from closing debits/credits **13,680**. Original
journal lines remain available and immutable. Cash-flow summaries net the linked
technical import/matching legs while retaining real receipts and refunds gross.

Operational invoice views use the current date, 7 November. The reports use
31 October: an invoice due31October is overdue today but current in the historical
31October aging. This is expected.

The API acceptance additionally settles the remaining invoice and bill in November
and proves every October report section and the retained GST draft remain unchanged.

## Screenshots

Actual Chromium captures: built web desktop **1440×900**, responsive web
**390×844**, and Expo web **390×844**. Each column below is a real app capture.

| Report | Web desktop | Web phone | Mobile Expo web |
| --- | --- | --- | --- |
| Trial balance | [Screenshot](web/17-trial-balance.png) | [Screenshot](web/18-phone-trial-balance.png) | [Screenshot](mobile/20-trial-balance.png) |
| Balance sheet | [Screenshot](web/17-balance-sheet.png) | [Screenshot](web/18-phone-balance-sheet.png) | [Screenshot](mobile/19-balance-sheet.png) |
| P&L | [Screenshot](web/17-profit-loss.png) | [Screenshot](web/18-phone-profit-loss.png) | [Screenshot](mobile/18-profit-loss.png) |
| Cash flow | [Screenshot](web/17-cash-flow.png) | [Screenshot](web/18-phone-cash-flow.png) | [Screenshot](mobile/21-cash-flow-final.png) |
| Receivables aging | [Screenshot](web/17-receivables-aging.png) | [Screenshot](web/18-phone-receivables-aging.png) | [Screenshot](mobile/22-receivables-aging.png) |
| Payables aging | [Screenshot](web/17-payables-aging.png) | [Screenshot](web/18-phone-payables-aging.png) | [Screenshot](mobile/23-payables-aging.png) |
| Completed bank statement | [Screenshot](web/16-bank-reconciliation-completed.png) | — | [Screenshot](mobile/17-completed-bank-close.png) |
| GST preparation / retained draft | [Worksheet](web/21-gst-worksheet.png) | [Retained draft](web/23-phone-gst.png) | [Preparation](mobile/27-gst-october-preparation.png), [draft](mobile/28-gst-saved-draft.png), [Box 15](mobile/28b-gst-filing-boxes.png) |

Operational web captures: [onboarding](web/01-onboarding.png),
[opening balances](web/03-opening-balances.png),
[invoice A](web/04-invoice-1-form.png), [invoice B](web/04-invoice-2-form.png),
[receipt A](web/06-receipt-1.png), [receipt B](web/06-receipt-2.png),
[received bill](web/07-bill-received.png), [supplier payment](web/08-bill-part-payment.png),
[paid expense](web/09-approved-expense.png), [credit A](web/10-credit-1.png),
[credit B](web/10-credit-2.png), [refund](web/11-customer-refund.png),
[statement preview](web/12-statement-preview.png), [fifth match](web/14-bank-match-5.png).
Mobile operational screenshots and exact phase records are in [mobile/](mobile/).

## Scope and reproduction

- Web signup, onboarding, chart/bank setup, reviewed opening journal, both invoices
  and receipts, supplier bill/payment, expense, credits/refund, CSV import, matching,
  completed statement, reports/exports and GST preparation/save use actual UI controls.
- Mobile uses actual UI controls for those business operations. The explicit setup
  exception is creating three chart accounts through the authenticated API: linked
  bank ledger, capital and expense. No economic transaction is API-seeded for mobile.
- The isolated web company records registration from1April; mobile/API companies
  record1October. All are registered throughout October and have no earlier
  taxable transactions, so the independent October expectations are identical.
- Supporting API GET requests assert persistence against the frozen independent
  figures. The API acceptance is separately labelled and does not substitute for UI proof.
- Both UI drivers preserve expected pre-authentication HTTP diagnostics. A logged-out
  `/api/me` returns 401; the web profile lookup before onboarding returns 404. These
  exact initial diagnostics are retained. All unexpected page/console errors fail.
- Reproduce using [web driver](../../../scripts/full-month-close-web-proof.mjs) and
  [mobile driver](../../../scripts/full-month-close-mobile-proof.mjs). Use fresh local
  companies and a database migrated through 0034. Never run against real financial data.
- Web results and asset/source identity are in [web/results.json](web/results.json)
  and [web/build-identity.json](web/build-identity.json). The final built artifact is
  `81b470f5c5b3`; all 359 included project sources match its source maps.
- The [working paper](working-paper.md), [frozen JSON](expected.json) and
  [standalone Decimal calculation](independent-working-paper.py) define expectations.
  [API results](api/results.json) retain original/as-of reports, all GST bases and
  the draft snapshot; [accountant review](accountant-review.md) records independent checks.
- Six actual web PDFs and CSVs are beside the screenshots. Their signatures, sizes,
  dates and independent totals are checked in [export-checks.json](web/export-checks.json).
  Mobile actual downloads are under [mobile/exports/](mobile/exports/).

## Fixes exposed by the walkthrough

- Match a posted customer-credit refund to its bank line using a company-scoped,
  posted refund journal identity; enforce bank, direction, amount and reuse guards.
- Retain five confirmed matches when the statement is completed.
- Prevent technical statement/matching journals inflating gross cash-flow figures;
  keep the original general ledger and preserve historical cutoffs and monthly columns.
- Show closing trial-balance sides/totals separately from period turnover in web,
  mobile, CSV and PDF; show net account movement in the cash-flow table.
- Preserve a web receipt's selected local calendar day in Auckland instead of
  converting midnight to the previous UTC day.
- Default conversation reads to Hono after hosted Supabase removal.
- Mobile: support custom dates in Expo web, restore standard GST when enabling tax
  on a zero-tax expense draft, expose refund matches, and distinguish equal-value
  receipts by date/reference. Use browser storage for home-task dismissal on web.
- Fix the statement-import screen’s empty error rendering on Expo web, and make
  the eight-column mobile trial-balance PDF landscape. Existing platform-specific
  browser report exports already worked; no replacement export implementation was added.

Each production bug fix has an authentic red/green regression record. Root test
logs are under [checks/](checks/); mobile records are under [mobile/](mobile/).
No applied migration, provider credential, dependency, native configuration,
release gate or warning allowance was changed.

## Verification evidence

All commands use the repository lockfiles and installed dependencies. Full API
output is compressed with its uncompressed SHA-256 retained in
[archive-integrity.json](checks/archive-integrity.json).

| Job / command | Node | Exit / observed result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 24.22.1 | 0; lockfile unchanged |
| `pnpm lint` | 22.23.4 | 0; zero errors, 120 visible warnings |
| `pnpm type-check` | 22.23.4 | 0; app and Node projects, zero errors |
| `pnpm test:run` | 22.23.4 | 0; 167 files, 870 tests |
| `NODE_ENV=production pnpm build` | 22.23.4 | 0; version verification, build 81b470f5c5b3 |
| `pnpm test:api` | 24.22.1 | 0; 135 files, 600 tests |
| `pnpm test:contracts` | 24.22.1 | 0; 44 files, 162 tests |
| `pnpm type-check:api` | 24.22.1 | 0; API and contracts, zero errors |
| Readiness script tests + web sourcemap tests + core report | 22.23.4 | 0; 23 + 3 tests, report PASS |
| SQLite migration verification | 24.22.1 | 0; exact decimals and tenant constraints PASS |
| Worker TypeScript and Wrangler dry-run | 24.22.1 | 0; no deployment |
| Actual local Worker acceptance | 22.23.4 | 0; 1 test, all scripted assertions pass |
| Full month-close API plus reconciliation regression | 24.22.1 | 0; 9 files, 24 tests |
| Updated API evidence retention and closing-total assertions | 24.22.1 | 0; 2 acceptance tests |
| Web complete UI pipeline, all six PDF/CSV downloads | Chromium | 0; 8 phases, unexpected errors zero |
| Mobile lint / types / Jest / iOS export | 20.20.2 | 0; 146 suites, 658 tests; zero lint/type errors, 74 visible lint warnings; iOS export succeeds |

### Mobile screenshots / device checks

Platform exercised: **Expo web in Chromium, 390×844**, real local Hono/SQLite.
An iOS JavaScript bundle export is a build check, not an installed-device run.

**Device checks pending:** iOS and Android installed builds: full month-close
walkthrough, native custom-date picker, expense tax toggle, bank matching,
landscape trial-balance print/share sheet, PDF/CSV sharing and home-task persistence.
No simulator/emulator or physical device was available in this environment.

Completed statements protect their bank cash cutoff. This work does not introduce
a company-wide fiscal-period lock. GST drafts prepare figures for a separate
myIR filing; nothing here submits a return or certifies statutory accounts.

Risk: **high**, human review required. No auto-merge or issue closure is requested.
