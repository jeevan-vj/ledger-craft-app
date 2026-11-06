# Reviewed opening balances and historical ledger recovery

Verified locally on 6 November 2026 with temporary SQLite, real migrations and
HTTP authentication/permissions. These are synthetic historical fixtures, not a
claim that a production company's existing books have been audited or repaired.

## Expected versus actual

| Case | Before | Independent expected result | Observed |
| --- | --- | --- | --- |
| Opening cash metadata | Metadata says 5,000; posted cash 0 | No ledger effect until reviewed opening journal; then cash debit 5,000 and capital credit 5,000 | Exact; replay returns same entry, no second opening |
| Partial GST historic expense | Gross 230, raw receipt GST 30, claimable 50%; old GST debit 30 and cost debit 200 | After receipt confirmation, GST 15, cost 215, cash paid 230 unchanged | Exact; original journal and receipt remain unchanged |
| Selected-bank supplier payment | Payment 69 names Operating but old journal credits generic 1110 | Debit generic cash 69, credit selected BANK ledger 69; AP and profit unchanged | Exact; preview does not create a chart account, apply creates it only if needed |
| Legacy expense bank match | Original expense cost 200/GST 30/cash 230 plus imported expense/cash 230 | Cost returns to 200; GST remains 30; combined cash paid returns from 460 to 230 | Exact; apply retry adds nothing |
| Undo and rematch recovered match | Corrected duplicate | Undo restores pre-correction cost 430 and combined cash paid 460; rematch returns cost 200 and cash paid 230, GST always 30 | Exact; original approved expense remains posted |
| Historical raw foreign posting | USD bill 100 has NZD snapshot 160 but source journal posts 100 | Flag discrepancy for source-rate review; do not invent a historical exchange correction | Warning returned; original AP remains 100 pending manual correction |
| Manual journal network retry | Same request/key arrives twice concurrently | One draft and one pair of lines; posting then retry returns same current posted entry | Exact; changed body/key conflicts 409, optional keyless creates remain supported |

Raw expected/actual JSON: [opening](ledger/opening-balances.json),
[expense GST](ledger/expense-gst-correction.json),
[supplier bank](ledger/supplier-bank-correction.json),
[duplicate bank posting](ledger/duplicate-bank-correction.json).

## Safeguards

- `GET /api/journal-entries/ledger-audit` only previews. It never changes balances
  or creates missing bank chart accounts.
- `POST /api/journal-entries/ledger-audit/apply` requires an explicit reviewed
  selection, evidence fingerprint, correction date and reason. Changed evidence
  is rejected with 409; correction before its source date is rejected with 400.
- Historical receipt GST may already be adjusted by a legacy client. Expense
  proposals require an additional receipt confirmation. If the recorded amount
  does not match the original receipt, the accountant must investigate and post
  an appropriate manual correction; the tool does not guess.
- Only the specific known posting patterns with matching company-scoped source
  documents, exact amounts and unambiguous confirmed matches are proposed.
  Reversed sources and multiply matched settlements are not automatically fixed.
- Corrections are additional balanced journals. Original documents/journal lines
  and applied SQL are not rewritten. Whole apply batches roll back on failure.
- Recovery of an imported duplicate also creates a normal reconciliation action;
  undo reverses the correction, not the original receipt/payment. Reapplying a
  reversed audit correction returns 409 and requires a fresh manual review or
  normal statement rematch.
- Opening journals require explicit reviewed balanced NZD lines against active
  accounts. A second differing opening is rejected with 409. Metadata by itself
  never introduces capital or cash.
- HTTP checks prove unauthenticated access is 401, read-only audit preview is
  permitted, and read-only opening/apply mutations are 403. Tenant isolation,
  inactive/non-NZD accounts, double-sided/unbalanced lines, stale evidence and
  transaction rollback are covered.

## Reproduce

From the repository root with Node 24:

```sh
ACCOUNTING_EVIDENCE_DIR="$PWD/docs/evidence/accounting-completion/ledger" \
  pnpm --filter @ledgercraft/api exec vitest run \
  src/modules/accounting/recovery.test.ts \
  src/modules/journals/journal-idempotency.test.ts \
  src/modules/journals/journals.test.ts
pnpm --filter @ledgercraft/contracts exec vitest run src/accounting-recovery.test.ts
pnpm --filter @ledgercraft/api type-check
```

Final targeted result: **3 API suites, 13 tests passed**; **2 recovery contract
checks passed**; strict API TypeScript passed. Logs from this run are
`/tmp/accounting-recovery-final.log`, `/tmp/accounting-recovery-contract-final.log`
and `/tmp/accounting-recovery-types-final.log`. Final full application gate
results are recorded by the root verification report.
