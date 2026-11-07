# API month-close acceptance

This is API acceptance against a fresh temporary SQLite database and real authenticated Hono routes. Browser and Expo walkthrough evidence is recorded separately. No real customer, provider, payment or filing was used.

The fixed accounting paper in `../expected.json` was prepared independently before report results. The API fixture signs up a new owner, persists the business/GST settings, creates a linked bank chart account, posts September30 reviewed opening balances, and records October invoices, receipts, received supplier bill, partial payment, approved expense, both receivable and paid-invoice credits, and the customer refund. Five imported bank rows are matched to those existing sources, and a canonical GST draft is saved and reloaded. November settlements must preserve October reports, source journals and the retained draft.

The explicit chart creation is API setup: bank creation alone does not materialize its linked chart account. An opening metadata balance does not replace or duplicate the reviewed opening journal. The fixture selects the same bank for receipt defaults, supplier payment, expense paid-from and refund.

Closing trial balance expectations use each account's `closingDebit`/`closingCredit`, totaling NZ$13,680 each. The report's `totalDebits`/`totalCredits` are period journal turnover, which includes auditable imported statement and matching correction entries; they are not closing trial balance columns.

Confirmed defects and red evidence:

- `refund-match-red.log`: a recorded credit-note refund could not be matched because the contract did not support it. The fix adds `credit_refund`, listed by its posted journal ID and retained in the existing `journalEntryId` match field. Matching validates the completed source, organisation, bank, direction and exact amount; retries, reuse rejection, undo/rematch and tenant isolation are checked.
- Completion left `matchedCount` at zero despite five confirmed matches. Completion now retains the actual confirmed match count.
- `cashflow-red.log`: imported bank rows and matching corrections inflated gross cash inflows/outflows to NZ$5,520/NZ$4,140 while net cash remained correct. The acceptance requires genuine cash inflows NZ$2,300/outflows NZ$920.

Run from repository root:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/reports/full-month-close.e2e.test.ts src/modules/reconciliation/
pnpm type-check:api
```

`results.json` contains source commands without credentials, the frozen paper, reports, completed statement and retained GST draft. Final test status is recorded in the command logs alongside it.

Final targeted run: **9 suites /24 tests passed** (see `verification.log`), including the independent month-close acceptance and all existing reconciliation suites. The final `results.json` has cash inflows NZ$2,300/outflows NZ$920, net NZ$1,380 and closing bank NZ$11,380.

Final `pnpm type-check:api` passed for both API and contracts (`typecheck.log`); `git diff --check` passed.
