# Web proof

Actual Chromium UI against the production artifact `d5251ad28f70`, built with Node22.23.4 on 8 November2026. Synthetic company Kauri Self-Service October Web Limited. The 10 phases cover signup/company GST setup, chart and linked bank ledger, opening journal, invoices, receipts, bills/expenses, credits/refund, bank reconciliation, all reports, GST draft, close/reopen and ZIP. All phases record zero unexpected console/page errors. Exact pre-auth401 and missing pre-setup profile404 are retained separately.

[Phase verification and audit history](verification.json), [actual canonical reports and raw GL](actual-reports.json), [ZIP checksum/bank/GST verification](archive-verification.json), [actual ZIP](Close-pack-2026-10-01-2026-10-31.zip).

| Step | Desktop screenshot | Phone viewport |
| --- | --- | --- |
| Bank ledger setup | [Linked by bank name](02b-bank-ledger-linked.png) | — |
| Opening journal | [Posted](03-opening-balances.png) | — |
| Bank reconciliation | [Completed](16-bank-reconciliation-completed.png) | — |
| Profit and loss | [1,500 profit](17-profit-loss.png) | [Phone](18-phone-profit-loss.png) |
| Trial balance | [13,680 each side](17-trial-balance.png) | [Phone](18-phone-trial-balance.png) |
| Balance sheet | [Balanced](17-balance-sheet.png) | [Phone](18-phone-balance-sheet.png) |
| Cash flow | [11,380 closing](17-cash-flow.png) | [Phone](18-phone-cash-flow.png) |
| Receivables aging | [920 current](17-receivables-aging.png) | [Phone](18-phone-receivables-aging.png) |
| Payables aging | [575 current](17-payables-aging.png) | [Phone](18-phone-payables-aging.png) |
| GST | [225 worksheet](21-gst-worksheet.png) | [Retained draft](23-phone-gst.png) |
| Period protection | [Closed](24-october-closed.png), [Reopened](25-owner-reopened-audit.png), [Reclosed audit](26-reclosed-history.png) | — |
| Accountant pack | [Downloaded](28-pack-downloaded.png) | [Phone](29-phone-pack.png) |

All nine role balances and raw period GL movements plus the independently known opening balances reconcile. Seven financial sections remain byte-equivalent after close/reopen/reclose. The mobile walkthrough separately exercises the closed-date rejection through UI; the API suite covers the broad guard matrix. This web walkthrough does not claim that every guarded operation was manually attempted in the browser.

Six actual PDFs and six CSVs are retained alongside extracted PDF text. The archive has14members and all13manifest member hashes/lengths verify. The bank statement is completed with five matches and zero difference. GST remains draft; manifest filing warnings are retained.

Reproduction: `CLOSE_STAGE=<signup|invoices|receipts|purchases|credits|bank|reports|gst|locks|pack> node scripts/self-service-web-close-proof.mjs`. Use a fresh synthetic local database and run stages in order; private auth/session state stays under `/tmp`, outside tracked evidence.
