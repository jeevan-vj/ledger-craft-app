# Mobile self-service month close

Verified 8 November 2026 using the actual Expo web UI in Chromium at 390×844. Synthetic company **Kauri Self Service Mobile Limited**, October 2026, NZD. This repeats the independent month-close business case with all chart accounts created through the mobile UI: bank ledger link by bank name, owner capital classified as equity, and operating costs classified as expense. No transaction or account fixture writes were used. Authenticated GETs independently inspect the resulting records.

The 12 phases cover signup, company/GST setup, opening journal, two invoices and receipts, partially paid supplier bill, paid expense, credits/refund, five bank matches, financial reports, GST draft, actual PDF/CSV downloads, accounting close/reopen and the accountant ZIP. Each phase JSON records zero unexpected browser console/page errors. Known onboarding diagnostics and the deliberately rejected closed-period request are identified separately. React Native Web emits existing shadow/pointerEvents deprecation warnings.

| Independent expectation | Actual |
| --- | --- |
| Trial balance debits / credits | $13,680 / $13,680 |
| Assets / liabilities / equity | $12,480 / $980 / $11,500 |
| Accrual revenue / expenses / profit | $2,700 / $1,200 / $1,500 |
| Cash opening / net movement / closing | $10,000 / $1,380 / $11,380 |
| Receivables / payables, current | $920 / $575 |
| Invoice-basis GST payable | $225 |
| Bank reconciliation difference | $0 |

The paper expectations match all nine ledger role balances and raw source movements, the seven financial sections, bank statement evidence and GST preparation. Cash-basis P&L independently matches $1,900 revenue less $700 costs = $1,200. See [audit](audit.json), [actual reports](actual-reports.json) and [period proof](period-proof.json).

## Screenshots

| Step | Screenshot |
| --- | --- |
| Signup and company/GST setup | [Signup](01-signup-review.png), [Company](02-company-gst-setup.png) |
| Chart setup entirely in mobile UI | [Bank ledger](04a-bank-ledger-created.png), [Capital classification](04b-chart-3000.png), [Expense classification](04b-chart-5000.png) |
| Opening journal | [Balanced and posted](05-opening-balanced-posted.png) |
| Invoices and receipts | [Invoice](08-invoice-A-issued.png), [Receipt](09-receipt-A.png) |
| Supplier bill and expense | [Bill](10-supplier-bill-half-paid.png), [Expense](11-approved-paid-expense.png) |
| Credit and refund | [Credit](12-credit-A.png), [Refund](13-customer-refund.png) |
| Bank reconciliation | [Zero difference](16-reconciled-zero-difference.png), [Completed statement](17-completed-bank-close.png) |
| Profit and loss | [Actual $1,500 profit](18-profit-loss.png) |
| Balance sheet | [Actual balances](19-balance-sheet.png) |
| Trial balance | [Balanced totals](20-trial-balance.png) |
| Cash flow | [Actual cash](21-cash-flow.png) |
| Aging | [Receivables](22-receivables-aging.png), [Payables](23-payables-aging.png) |
| GST | [Preparation](27-gst-october-preparation.png), [Retained draft](28c-gst-retained-record.png) |
| Accounting protection | [Closed](31-accounting-period-closed.png), [Backdated journal blocked](32-backdated-journal-blocked.png), [Owner reopen](33-owner-reopened-with-audit.png), [Audit history](34-accounting-close-audit-history.png) |
| Accountant ZIP | [Downloaded](35-accountant-close-pack-downloaded.png), [Actual archive](Close-pack-2026-10-01-2026-10-31.zip) |

The reviewed close creates revision 1. A manual expense/equity journal dated October 15 receives HTTP 409 `ACCOUNTING_PERIOD_CLOSED`, and the entire journal list remains unchanged. Owner reopen from October 1 moves the cutoff to September 30 (revision 2); reviewed reclose restores October 31 (revision 3). Reasons, actor and revision remain in audit history. All seven financial sections remain identical after these operations.

The ZIP was downloaded using the mobile UI, then independently opened and checked: 14 members, all 13 manifest member hashes and byte counts valid, canonical CSV totals correct, complete bank reconciliation, GST preparation/draft and period cutoff revision 3. Its full-company accrual scope is explained in the UI even when current report filters differ. See [archive verification](close-pack-verification.json). Manifest warnings honestly retain credit/reversal review and absence of a filed GST confirmation. A draft is not an IRD filing.

Six real report PDFs, six CSVs and GST PDF were downloaded and inspected in [exports](exports/verification.json). PDFs have valid signatures and extracted text; trial balance is landscape and contains the expected totals.

## Checks and limits

Node 20.20.2: **150 Jest suites / 674 tests pass**, TypeScript 0 errors, ESLint 0 errors / 74 existing warnings. iOS and Android bundle exports pass. See [checks](checks/) and [source hashes](metadata.json). Targeted report permission tests were rerun after the final import-order cleanup and all 11 pass. The full run preceded that import-only test cleanup; production source was unchanged.

Installed iOS/Android QA could not run: no simulator/emulator/device tools are available in this Linux environment. Native file/share behavior has unit coverage and both platform bundle checks, but an installed-device share-sheet, cancellation, lifecycle, keyboard and date-picker walkthrough remains outstanding. Expo web proof is not a claim of native device testing.

The coordinated API restart occurred after business transactions and before period/ZIP proof, preserving database and authentication. No source journals or amounts changed. No real provider, GST submission, native publication or production deployment was performed.

Reproduction driver: [self-service-mobile-close-proof.mjs](../../../../scripts/self-service-mobile-close-proof.mjs). Private authentication/session files remain under `/tmp` and are excluded from evidence.
