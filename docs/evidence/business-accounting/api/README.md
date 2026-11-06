# Accountant acceptance: NZ consulting company

Run the real SQLite, public HTTP API scenario with Node 24:

```sh
GST_EVIDENCE_DIR="$PWD/docs/evidence/business-accounting/api" /workspace/.tools/node_modules/.bin/pnpm --filter @ledgercraft/api exec vitest run src/modules/tax/business-accounting.e2e.test.ts
```

The test signs up a synthetic user, sets up an NZ GST-registered company,
creates customers and a supplier, posts owner capital and business documents,
records settlements, transfers funds, reads reports, and saves a draft GST
preparation record. It uses isolated temporary SQLite with real migrations.
No external filing or production data is involved.

The independent worksheet is:

| Operation | Net | GST | Gross | Settled |
| --- | ---: | ---: | ---: | ---: |
| Consulting invoice A | 1,000 | 150 | 1,150 | 1,150 |
| Consulting invoice B | 400 | 60 | 460 | 230 |
| Approved operating expense | 200 | 30 | 230 | 230 |
| Approved exempt expense | 50 | 0 | 50 | 50 |
| Received subcontractor bill | 300 | 45 | 345 | 69 |

Owner capital is 5,000. A 1,000 transfer between business bank accounts has no
income, expense or GST effect.

Expected revenue is 1,400, expenses 550 and profit 850. Receivables are 230,
payables 276 and combined ledger cash 6,031. Invoice-basis GST is output 210
less input 75 = 135 payable. The balance sheet presents GST gross: assets
6,336 (cash 6,031 + receivables 230 + GST input 75), liabilities 486
(payables 276 + GST output 210), equity 5,850. A later month with no activity
has zero period profit and retains the same balance sheet.

The scenario asserts each journal balances, the trial balance balances, and
another company cannot read the draft return or see the business's profit/GST.
The draft preparation record has gross sales 1,610 and purchases 625, including
50 exempt purchases. Stored preparation values are supplied by the test's
worksheet; this API test does not prove the web wizard derives them.

The shared `GET /api/tax/gst-preparation?from=YYYY-MM-DD&to=YYYY-MM-DD`
now supplies the same figures to web and mobile. It binds the active company,
reads ledger GST and dated immutable gross journal movements in one transaction, and
returns decimal strings with explicit invoice basis and foreign-currency
warnings. Contract/API tests reject invalid periods, exclude unposted drafts,
unapproved expenses, foreign documents and other periods,
and prove isolation from a second company. The business scenario asserts the
endpoint returns gross sales 1,610, purchases 625, output GST 210, input GST 75
and net GST 135.

Historical periods now remain consistent after cancellation, restoration or
expense deletion. A sale posted in April for 1,150/GST150 and cancelled in May
stays 1,150/GST150 in April; May reports -1,150/-150 and a reversal-adjustment
review warning. Bills behave the same way. Restoration is a positive movement
in its actual posting period. Gross uses the existing immutable journal total,
not a new GST formula. Retained exchange-rate usage keeps a deleted foreign
expense and its source-journal reversal excluded from NZD GST.

Two defects were reproduced before production fixes:

1. Supplier payment journals credited generic account 1110 despite an explicit
   bank selection. New payments now credit the selected bank's ledger account.
   Existing historical journals are not rewritten. Reconciliation's
   `skipPosting` path still posts its own bank allocation; its undo tests pass.
2. A later period omitted prior unclosed profit from balance-sheet equity,
   falsely reporting an imbalance. Equity now includes cumulative unclosed
   profit/loss; the period P&L remains restricted to the selected dates.

Financial report GST explicitly remains invoice basis, even for a cash-filtered
report. The independently calculated payments-basis position would be output
180, input 39, payable 141; the API does not claim that alternative GST basis.
Bank transaction/statement balances are a separate reconciliation book and are
not synthesized by this test from accounting document settlements.

## Statement reconciliation proof

`bank-reconciled-business.e2e.test.ts` proves the complete statement workflow
from zero bank opening balances. Import the 5,000 owner deposit, then accept it
with a split to capital account 3000. Record invoice receipts and approved
expenses normally; import their actual statement rows and confirm matches to
the existing **payment** or **expense**, rather than creating another payment.
For the 69 supplier instalment, import the withdrawal and Accept an allocation
of 69 against the unpaid received bill. Create the internal 1,000 transfer.
Complete Operating against its 5,031 closing statement, and Savings against
1,000. Both bank statement balances equal their individual BANK ledger accounts;
combined cash is 6,031, profit 850 and GST payable 135. All statement rows are
reconciled. The raw proof is `bank-statement-reconciled-company.json`.

This reproduced and fixed two further accounting defects. Confirming existing
payment/expense matches previously retained the import's generic income/expense
posting, duplicating cash and profit. A new immutable reclassification removes
that duplicate and attributes the original cash leg to the statement bank.
Matching retries return the existing match; a second row cannot reuse the same
book entry. Undo reverses the reclassification without reversing the original
payment/expense, and matching again works. Unequal existing settlement amounts
are rejected rather than silently treated as partial matches.

Statement completion previously used a never-populated book closing balance,
so a genuine nonzero statement could not complete. It now reads the selected
bank's cumulative posted ledger through statement end. Declared bank opening is
only a fallback when that bank has no ledger history. A regression with 5,000
declared opening and 5,000 already-posted prior capital proves it remains 5,000,
not 10,000. Completion retries preserve the completed record, and an action in
a completed statement cannot be undone. These three affected suites pass eight
tests, including the complete business scenario; API TypeScript passes.

The legacy match contract has no supplier-payment item type: matching a 69
already-recorded supplier payment to a 345 bill still compares against the full
bill. The verified workflow imports first and accepts the 69 unpaid-bill
allocation. No historical journals or legacy match records are rewritten.
Confirming a legacy invoice/bill match now fails with actionable guidance to
use Accept for an unpaid document or match its already-recorded payment; it
cannot flag a duplicate posting as safely reconciled.

## Expense GST eligibility

New approved postings apply the persisted claimable percentage and private-use
percentage using exact decimal multiplication. For gross230/rawGST30, standard
claims30/cost200, partial50% claims15/cost215, exempt or zero-rated claims0/cost230,
and private25% claims22.50/cost207.50. Combined partial50% and private25% uses the
existing multiplicative policy and claims11.25/cost218.75. Receipt GST remains30
on the source record and total cash paid remains230; nonclaimable GST is part
of expense cost. Existing immutable postings are not rewritten.

Paid-from accounts are restricted server-side to bank, cash, credit-card or loan
accounts. Selecting revenue, expense, equity or an unrelated asset returns400
instead of crediting the expense back to itself. The final affected five-suite
group passes20 tests; API and contracts TypeScript both pass.

Validation: the scenario passed; the affected GST/purchases/reconciliation
group passed 13 tests with one existing credit-note capability skip; the
reports/scenario group passed six tests; API strict TypeScript passed.
