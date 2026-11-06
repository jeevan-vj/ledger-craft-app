# Historical NZD receivable/payable ageing

Real temporary-SQLite HTTP regressions reproduce and fix two errors: foreign
invoices/bills disappeared from ageing, and a later settlement changed an older
report because it read today's `balanceDue`, payment totals and status.

| Independent case | Expected | Actual verified |
| --- | --- | --- |
| USD100 invoice and bill posted at NZD1.60 | Each control balance 160 | 160 |
| Reviewed 31 October rate NZD1.70 | AR ageing 170 and AP ageing 170 | 170 / 170 |
| 1 November automatic reversal | AR and AP ageing return to 160 | 160 / 160 |
| Both settled 2 November at NZD1.65 | AR and AP ageing 0 | 0 / 0 |
| Re-read October after those settlements | October remains 170 / 170 | Unchanged |
| Receipt reversed 3 November | 2 November remains AR0; 3 November AR160 | 0 / 160 |
| NZD invoice1,150 received 2 November | October ageing1,150, November ageing0 | 1,150 / 0 |
| Sources cancelled2 November and restored4 November | October160 each; 3 November0 each; 5 November160 each | Exact |
| USD25 credit against USD100 source | Before credit AR160; after credit AR120; after later reversal AR160 | Exact; older reports unchanged |
| One bank acceptance allocates115 and230 to two invoices | Before acceptance345; after0; later undo restores individual115/230 | Exact; customer filter returns only230 |

Ageing now attributes dated posted and reversed control-account journal lines to
source invoices/bills. Payment and credit-note reversals resolve retained source
journal IDs. Revaluation and next-day reversal movements retain their document
reference. Multi-document bank allocations preserve per-invoice/bill attribution
through undo. No second FX conversion or current-status guess is used.

Rows and ageing buckets are in NZD, with source due dates. Original source and
payment-book amounts also supply historical document summaries; an unrealized
valuation does not become a negative paid amount. Company and customer/vendor
predicates stay in repository queries.

Manual/opening control journals without invoice/vendor allocation remain
unallocated: they do not have a defensible customer or due date and are not
invented as invoice rows. This evidence covers the linked document subledger;
compare any unallocated manual control entries separately.

Raw expected/actual report evidence:
[historical FX ageing](ledger/historical-fx-aging.json).

Reproduce with Node24 from the repository root:

```sh
ACCOUNTING_EVIDENCE_DIR="$PWD/docs/evidence/accounting-completion/ledger" \
  pnpm --filter @ledgercraft/api exec vitest run \
  src/modules/reports/reports-aging-history.test.ts \
  src/modules/reports/reports.test.ts \
  src/modules/tax/business-accounting.e2e.test.ts \
  src/modules/tax/bank-reconciled-business.e2e.test.ts
```

The four-suite regression group passes13 tests, including five new historical
ageing scenarios. The wider application suite is reported separately.

## Account-statement opening balance

A separate regression reproduced metadata5,000 plus a reviewed5,000 opening
journal producing a false10,000 account statement. Account statements now seed
opening balances from dated posted journals only, consistent with the trial
balance and Accounts screen. Metadata alone reports0; the April opening journal
reports closing5,000, and May reports opening/closing5,000 without duplication.

`account-statement-opening.test.ts` failed with expected5,000/actual10,000 before
the one-line production fix. It now passes. The final affected reports group
(`reports-aging-history`, `account-statement-opening`, `reports`) passes11 tests
across3 suites; strict API TypeScript also passes. See
`/tmp/account-statement-opening-red.log`, `/tmp/reports-final-scope.log`, and
`/tmp/reports-final-scope-types.log` for this run's output.
