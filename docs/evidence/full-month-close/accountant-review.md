# Independent accountant review

Reviewed against frozen working-paper-v2, SHA256
`c581c7343a971e4844971a5885d601a4c70308fc66ed423e53f9e388a05b3739`.
The expected paper was prepared before inspecting application output.

## API evidence reconciliation

A separate Python Decimal check of `api/results.json` confirmed:

| Control | Expected | Observed |
| --- | ---: | ---: |
| Closing trial balance, debit and credit each | 13,680.00 | 13,680.00 |
| Accrual profit | 1,500.00 | 1,500.00 |
| Assets | 12,480.00 | 12,480.00 |
| Liabilities | 980.00 | 980.00 |
| Equity | 11,500.00 | 11,500.00 |
| Cash opening | 10,000.00 | 10,000.00 |
| Gross cash inflow | 2,300.00 | 2,300.00 |
| Gross cash outflow | 920.00 | 920.00 |
| Cash movement | 1,380.00 | 1,380.00 |
| Cash closing | 11,380.00 | 11,380.00 |
| Current receivables | 920.00 | 920.00 |
| Current payables | 575.00 | 575.00 |
| Invoice-basis GST payable | 225.00 | 225.00 |
| Reconciliation difference | 0.00 | 0.00 |
| Confirmed statement matches | 5 | 5 |

All overdue aging buckets and unallocated controls were zero. The input GST
asset of 180 and output GST liability of 405 explain the gross balance-sheet
presentation; their net liability is 225.

The report DTO's `totalDebits`/`totalCredits` are **period journal turnover**, not
closing net account balances. Observed turnover was 14,605 per side after
statement import and matching. Closing trial balance is independently the sum of
`closingDebit`/`closingCredit`, 13,680 per side. Base October economic turnover
without technical import/matching rows is 8,165 per side. Turnover must not be
presented as the closing trial-balance control.

## Static review of fixes

The cash-flow change groups statement-import cash and its reconciliation/undo
cash legs using persistent transaction/action/journal identities. It leaves the
source receipt and refund gross, retains original ledger rows and trial-balance
activity, preserves row dates and passes the grouping into monthly columns.
This corrects inflated gross flows without changing the cash balance. Reviewed
coverage includes original receipts/refunds, unmatched import, undo/rematch and
period cutoffs. No blocking accounting defect was identified in this diff.

The customer-credit-refund matching change identifies a posted journal linked to
a completed, organisation-scoped refund; it checks full amount, outgoing
direction and the selected bank. Reuse/retry protections include refund journal
identity. Undo reverses the reconciliation correction while preserving the
original refund. Negative API coverage includes wrong direction, unknown refund,
other bank, reuse, retry, undo/rematch and another organisation. No blocking
accounting defect was identified in the reviewed change.

Presentation recommendation: retain existing turnover fields for compatibility,
but label period debit/credit activity explicitly and show separate closing debit
and credit totals on web, mobile and exports.

## Scope

This is synthetic accountant reconciliation and static implementation review,
not statutory assurance or tax advice. UI screenshots and platform walkthroughs
are separate evidence; the API result does not prove native device execution or
real IRD filing. Payments/hybrid assertions are present in the API acceptance
suite; the retained result artifact records invoice-basis preparation.
