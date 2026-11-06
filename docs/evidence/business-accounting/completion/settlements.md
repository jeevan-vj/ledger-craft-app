# Settlement and FX completion evidence

Verified locally on 6 November 2026 using Node 24.22.1, real Hono requests,
organisation sessions and temporary migrated SQLite. No production data changed.

| Scenario | Independent expected result | Verified |
| --- | --- | --- |
| Existing supplier instalment | Bill 345, payment 69: AP 276; cash −69, expense 300, input GST 45; matching creates no second settlement | Pass, including retry, another-row rejection, tenant isolation, undo and rematch |
| Foreign receivable | USD 100 at 1.60 posts AR 160. Receipt at 1.65 posts cash 165, clears AR 160 and realizes gain 5 | Pass; reversing receipt reverses the gain and restores the original foreign balance |
| Foreign payable | USD 100 at 1.60 posts AP 160. Payment at 1.65 posts cash 165, clears AP 160 and realizes loss 5 | Pass |
| Falling settlement rate | USD 100 at 1.55 posts cash 155 versus carrying 160: receivable loss 5, payable gain 5 | Pass |
| Small foreign instalments | USD 0.03 carrying NZD 0.05 clears in amounts 0.02/0.01/0.02, with no residual AR | Pass |
| Many small cost categories | Seven USD 0.01 categories carry total NZD 0.11 without a negative final category | Pass: allocations 0.02/0.01/0.02/0.01/0.02/0.01/0.02 |
| Cancellation and restoration | Foreign source carrying 160 remains 160 on original, cancellation and restoration journals | Pass; source rates and journals remain immutable |
| Reviewed closing AR | USD 100 carrying 160 at 1.70 becomes 170 on 31 Oct; unrealized gain 10 reverses 1 Nov; receipt 2 Nov at 1.65 realizes only 5 | Pass |
| Reviewed closing AP | USD 100 carrying 160 at 1.70 becomes 170, with unrealized loss 10 and next-day reversal | Pass |
| Shared closing retry | An authorized second accountant repeats the same company/date body | Same journal IDs, no second posting; changed body 409 |
| Invalid rate/account/date | Future/unknown/other-company rate, incompatible gain/loss account or receipt before invoice/bill | Rejected without retaining a settlement or settlement journal |
| Closed valuation date | Backdated settlement through a reviewed closing period | 409; future closing dates 422 |
| Credit-note payment state | Original 100, cash 50, credit 20, cash 30 | Paid 80, credited 20, due 0; active credit blocks original cash reversal and out-of-order receipts |
| Lost supplier-payment response | Same-key retry of partial USD 25 at 1.65 | One payment, one settlement journal, source balance 75; changed amount under same key 409 |
| Statement completion preview | Matched supplier payment 69 gives posted book balance −69, difference 0 and readiness true before completion; final stored closing −69 | Pass; next-month activity excluded and tenant access rejected |
| Native foreign bank writes | USD statement/native manual entry or legacy-row Accept/personal/details/duplicate | 422 with no added payment, journal or reconciliation state |

The settlement-focused command exited 0 with **6 suites / 25 tests passed**:

```sh
pnpm --filter @ledgercraft/api exec vitest run \
  src/modules/reconciliation/foreign-bank-guard.test.ts \
  src/modules/reconciliation/supplier-payment-match.test.ts \
  src/modules/currency/settlements.test.ts \
  src/modules/currency/revaluation.test.ts \
  src/modules/purchases/bill-payment-idempotency.test.ts \
  src/modules/payments/payment-credit-state.test.ts
```

API strict TypeScript exited 0. The two affected contract suites exited 0 with
3 tests passed. An earlier affected group covered existing currency,
reconciliation, payment, purchase, invoice lifecycle and ledger recovery tests:
9 suites / 34 tests passed before the final guards. The root verification report
records the final combined suites and browser evidence.

The later authoritative-summary regression group passed **3 API suites / 7 tests**
(summary, full bank business case and existing reconciliation routes). The public
contract regression passed 2 tests. `GET /api/reconciliation-sessions/:id/summary`
and `POST /api/reconciliation-sessions/:id/complete` call the same server
calculation. A read-only preview never fills `session.bookClosingBalance`; its
separate exact `bookBalance` and `isReconciled` fields come from the posted ledger.
Invalid/reversed statement periods and sub-cent declared balances are rejected.

## Boundaries

Foreign invoices and bills use reviewed rates and NZD bank settlements. Native
foreign-bank statement valuation is **not implemented**: new raw foreign
statement writes fail closed rather than masquerading as NZD. Existing foreign
rows remain readable for an accounting audit. Explicit-rate cross-currency
transfers retain their existing separate contract.

Migration 0026 adds nullable settlement snapshots and a supplier-payment match
identity link with composite organisation foreign keys. It does not invent
historical FX values. A legacy foreign source journal or settlement with
unverified carrying amounts returns 409 for audit instead of being silently
rewritten or reused. Closing adjustments reverse on the following calendar day;
source-document GST and original exchange rates remain unchanged.
