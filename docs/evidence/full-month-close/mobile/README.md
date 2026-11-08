# October month close — mobile

**PASS: actual Expo web, Chromium 390×844, local Hono/SQLite.** This is a synthetic NZ business. It does not establish installed iOS/Android acceptance, provider delivery, or an IRD filing.

Kauri Mobile Services Limited starts October with $10,000 bank / capital brought forward from 30 September. The complete UI flow creates two invoices, two $1,150 receipts, a $1,150 supplier bill with a $575 payment, an approved paid expense of $230 including $30 GST, a $230 receivable credit, and a $115 customer credit followed by its $115 refund. Five statement movements match the existing postings and the reviewed statement completes with no adjustment.

All ten final phases passed with **zero page errors and zero unknown console errors**. The initial unauthenticated `/api/me` 401 is retained with its exact URL and message in [phase-signup.json](phase-signup.json); React Native Web deprecation warnings remain visible in the phase records. Earlier diagnostic images and companies are excluded from this gallery.

| Independent expected result | Actual | Screenshot |
| --- | --- | --- |
| Closing trial-balance debits = credits $13,680; period turnover $14,605 each | Exact match | [Trial balance](20-trial-balance.png) |
| Assets $12,480 = liabilities $980 + equity $11,500 | Exact match | [Balance sheet](19-balance-sheet.png) |
| Accrual revenue $2,700 − costs $1,200 = profit $1,500 | Exact match | [P&L](18-profit-loss.png) |
| Opening cash $10,000 + receipts $2,300 − payments/refund $920 = closing $11,380 | Exact match | [Cash flow](21-cash-flow-final.png) |
| Receivables $920, all current as at 31 October | Exact match | [Receivables aging](22-receivables-aging.png) |
| Payables $575, all current as at 31 October | Exact match | [Payables aging](23-payables-aging.png) |
| Cash-basis revenue $1,900 − settled costs $700 = profit $1,200 | Exact match | [Cash P&L](26-cash-profit-loss.png) |
| Every closing account agrees to independently summed raw journal lines | All nine account roles match | [Bank general-ledger drill-down](24-general-ledger-bank.png) |
| Statement/book closing $11,380; five matches; difference $0 | Completed | [Completed bank close](17-completed-bank-close.png) |
| GST output $405 − input $180 = payable $225 | Draft saved, not filed | [Preparation](28-gst-saved-draft.png), [myIR boxes including Box 15](28b-gst-filing-boxes.png), [retained record](28c-gst-retained-record.png) |

The balance sheet keeps the $180 input-GST asset and $405 output-GST liability separately. Netting them would give assets $12,300 and liabilities $800; equity and net GST remain unchanged. Technical import/matching journals retain their audit trail and have no net effect on these figures. Cash-flow inflows/outflows exclude those linked technical legs; raw general-ledger turnover remains available.

## Actual UI evidence

[Signup](01-signup-review.png) · [GST onboarding](02-company-gst-setup.png) · [Business profile](03-business-profile.png) · [Bank opening metadata](04-bank-opening-metadata.png) · [Reviewed opening journal](05-opening-balanced-posted.png) · [Monthly GST settings](06-registered-monthly-gst.png) · [Invoice A](08-invoice-A-issued.png) · [Receipt A](09-receipt-A.png) · [Invoice B](08-invoice-B-issued.png) · [Receipt B](09-receipt-B.png) · [Supplier bill/payment](10-supplier-bill-half-paid.png) · [Approved expense](11-approved-paid-expense.png) · [Receivable credit](12-credit-A.png) · [Customer credit](12-credit-B.png) · [Refund](13-customer-refund.png) · [Statement CSV preview](14-bank-five-lines-preview.png).

**Explicit setup API exception:** Expo has no chart-of-accounts creation screen. The driver creates only the bank-linked ledger asset, owner-capital account 3000 and operating-expense account 5000 via the API. Signup, business setup, bank metadata/default selection, the opening journal, and every operational transaction are entered through the application UI. API reads validate the resulting records; they do not seed the transactions.

The frozen [independent working paper](../working-paper.md) and [expected values](../expected.json) precede report observations. [audit.json](audit.json) includes all nine account comparisons, an independent integer-cent sum of raw journal lines, the actual match payloads with source dates/references, completed statement, and saved GST calculation. [actual-reports.json](actual-reports.json) retains the actual accrual/cash reports and complete general ledger. [metadata.json](metadata.json) records source hashes, platform and diagnostics.

## Downloaded files

The UI downloaded six PDFs, six CSVs and the retained GST-preparation PDF. [Export verification](exports/verification.json) records sizes and SHA-256 hashes; every PDF has `%PDF-`, exceeds 1KB, and was extracted with `pdftotext`. The exported values were checked against the independent expected figures. The eight-column trial balance uses landscape pages and was visually inspected after rendering.

| Report | Actual PDF | Actual CSV |
| --- | --- | --- |
| Trial balance | [PDF](exports/Report-trial-balance-2026-10-01-2026-10-31.pdf) | [CSV](exports/Report-trial-balance-2026-10-01-2026-10-31.csv) |
| Balance sheet | [PDF](exports/Report-balance-sheet-2026-10-01-2026-10-31.pdf) | [CSV](exports/Report-balance-sheet-2026-10-01-2026-10-31.csv) |
| Profit & loss | [PDF](exports/Report-profit-loss-2026-10-01-2026-10-31.pdf) | [CSV](exports/Report-profit-loss-2026-10-01-2026-10-31.csv) |
| Cash flow | [PDF](exports/Report-cash-flow-2026-10-01-2026-10-31.pdf) | [CSV](exports/Report-cash-flow-2026-10-01-2026-10-31.csv) |
| Receivables aging | [PDF](exports/Report-receivables-2026-10-01-2026-10-31.pdf) | [CSV](exports/Report-receivables-2026-10-01-2026-10-31.csv) |
| Payables aging | [PDF](exports/Report-payables-2026-10-01-2026-10-31.pdf) | [CSV](exports/Report-payables-2026-10-01-2026-10-31.csv) |
| GST preparation | [Saved draft PDF](exports/GST-2026-10-01-2026-10-31-draft.pdf) | Not a GST-submission file |

## Fixes and verification

[Test-first evidence](red-green.md) covers historical date entry on Expo web, explicit GST activation on an untaxed expense, matching customer refunds, identifying equal receipts by date/reference, separating closing TB totals from period turnover, browser task-dismissal storage, landscape TB PDFs, and the statement-import empty-text console error.

Reproduce with local API `:3001` and Expo `:8081`: run `node scripts/full-month-close-mobile-proof.mjs` with phases `signup`, `setup`, `invoices`, `bill`, `expense`, `credits`, `bank`, `reports`, `audit`, `exports` in that order, starting with no `/tmp/monthclose-mobile-state.json` or `/tmp/monthclose-mobile-records.json`. Those private local session files are deliberately excluded from evidence.

Native checks still pending: installed iOS/Android date picker/keyboard, PDF generation and share sheet, back gestures, and background/offline handling. Native exports compile and their invocation is covered by module tests; browser downloads are the actual artifacts linked above. No email, payment provider, native release, deployment or external GST filing was performed.

Post-install verification used Node **20.20.2** and the locked mobile dependencies. Every command exited **0**:

| Command | Actual result |
| --- | --- |
| `npm ci --cache /tmp/monthclose-mobile-npm-cache --prefer-offline --no-audit --no-fund` | 2,182 packages installed in 36 seconds |
| `npm run lint` | 0 errors, 74 warnings |
| `npx tsc --noEmit --pretty false` | No compiler diagnostics |
| `npm test -- --ci --watchAll=false` | 146 suites, 658 tests passed; Jest reported a worker teardown warning |
| `EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true npx expo export --platform ios --output-dir /tmp/expo-ios-monthclose-verified` | Export completed |

[Raw command logs and Node version](checks/) are retained. The Expo server was restarted after `npm ci` invalidated Metro's module cache; the subsequent GST screenshot capture is read-only. The full strict operational run occurred before that dependency reinstall with the same locked versions and final production source.
