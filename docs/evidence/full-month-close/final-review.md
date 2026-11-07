# Final independent working-tree review

Verdict: **CHANGES REQUESTED — evidence gates pending**, with no blocking source-correctness finding in the reviewed production patch.

Reviewed base: `77c560b`; uncommitted working tree on `codex/full-month-close-acceptance`. This is an independent source/evidence review, not a posted GitHub approval, head-commit approval or merge recommendation. No labels, commits or remote writes were made by the reviewer.

## Acceptance and correctness

The requested close is explicitly opening balances → invoices → receipts → bills/expenses → credits/refunds → bank reconciliation → GST, with independently reconciled trial balance, balance sheet, P&L, cash flow and aging on web and mobile.

- The independent paper was frozen before application output. Python Decimal checks of the retained API artifact match closing TB13,680 each, profit1,500, assets12,480/liabilities980/equity11,500, cash opening10,000/inflow2,300/outflow920/closing11,380, AR920/AP575, all aging buckets, invoice GST225 and five matches/difference0. See `accountant-review.md`.
- `PaymentForm.tsx` preserves the chosen local calendar date for both payment creation and foreign settlement-rate lookup. The Auckland regression specifically exercises a day that UTC conversion would shift.
- `SmartDatePicker.tsx` adds a web-only custom-date path, validates exact round-tripping calendar dates and minimum dates; native pickers retain their existing paths. Invalid and historical-date behavior is asserted.
- `reports.engine.ts` nets only cash legs connected to imported statement/reconciliation actions. Persistent transaction/action/journal identities cover undo and rematch; dates stay attached to rows, monthly columns reuse the map, and original GL/TB lines remain intact. Unmatched imports remain present. Source receipts and customer refunds retain their gross economic amounts. The map is organisation-scoped in the repository.
- Closing TB totals are calculated with the existing Decimal helper, added optionally to the contract for old response compatibility and shown independently from period turnover on web/mobile. Export columns explicitly separate opening, period and closing debit/credit sides. No frontend recomputation of money was introduced.
- Refund matching requires a completed refund with a posted journal, organisation scope, exact amount, outgoing direction and matching bank. Existing match protection includes the refund journal identity. Undo reverses reconciliation accounting while leaving the original refund intact. Tenant isolation, wrong bank/direction, reuse, retry and undo/rematch have behavioral API coverage.
- Mobile expense GST: enabling tax after loading a pending expense with zero rate restores the existing NZ15% default only when the saved rate is zero. Existing positive rates are retained. No new arithmetic/totals helper is introduced. The agent supplied failing-before/passing-after component evidence and is rerunning a fresh business UI scenario after discovering this defect.

## Blockers before final review-passed or merge recommendation

1. Complete the final `ledgercraft-verify` command table with command, required Node version, exit code, summary and logs for all required jobs, or the exact permitted exception plus green matching CI. Targeted tests alone do not meet that repository gate. The complete table was not present when this review was written.
2. Finish the fresh-company mobile walkthrough and retain its final report/reconciliation screenshots and assertions. At review time the old company's failed expense run was diagnostic evidence; it must not be represented as a successful month close. Mobile README correctly marks progress rather than complete acceptance.
3. Include the required **Mobile screenshots / device checks** section and **Device checks pending** list. Current actual platform is Expo web Chromium390×844; installed iOS/Android execution is pending and must remain explicitly pending.
4. Verify final review against a concrete committed PR head after the production patch and evidence freeze. This uncommitted review cannot establish the repository's head-commit gate.

These are review/verification completion gates, not a request to hide or waive missing native evidence.

## Export assumptions and remaining risks

`financialReportRows` now returns eight TB columns. All inspected consumers use dynamic headers/cell indexes: web jsPDF, mobile web jsPDF, mobile native HTML and CSV. No hard-coded five-column debit/credit interpretation was found. Financial data remains exact decimal text. The wider table can become cramped in portrait PDF; inspect an actual downloaded TB PDF before claiming readable export layout. A PDF signature alone proves file creation, not legibility. CSV column semantics are directly asserted by the contracts test.

`trialBalance.balanced` still denotes period debit/credit equality for compatibility; the new closing totals are distinct. Account-filtered reports may intentionally be unbalanced. Do not reinterpret period turnover14,605 as the closing TB13,680.

This synthetic scenario uses NZD, standard15%, full input claim and invoice-basis monthly registration. It does not certify an actual taxpayer's GST eligibility, real IRD acceptance, provider integrations, payroll, inventory valuation or native-device behavior. No unrelated feature expansion, schema migration, new authentication, new invoice totals helper or float money accumulation was introduced.

## Security, invariants and risk

Organisation scoping comes from existing authenticated contexts; refund lookup and cash-flow actions queries explicitly scope organisation. No new public token route, secret, Supabase path or second auth session was added. Money stays decimal text/Decimal; no SQL SUM/REAL money or applied-migration edit was found. Retry/reuse checks are preserved. Native-platform claims remain constrained to actual execution.

Risk: **high** under `docs/PIPELINE.md` because the expense tax behavior/CODEOWNERS path is touched. Human review is required; auto-merge is not eligible. This patch also exceeds the small-change auto-merge limits.

## Evidence integrity

API README explicitly identifies authenticated Hono/SQLite acceptance and chart creation as API setup. Mobile script/README identify the three chart-account creates as a setup-only API exception because mobile lacks chart creation. Financial documents and settlement operations are UI-driven; read-only API requests independently inspect responses. Web proof drives setup and source operations through browser UI. Scripts do not stub report responses. Screenshots labelled failure are diagnostic. No actual IRD submission or native device claim is made.

## Reviewed production source files

- `api/src/modules/reconciliation/existing-posting.repository.ts`
- `api/src/modules/reconciliation/existing-posting.ts`
- `api/src/modules/reconciliation/reconciliation.repository.ts`
- `api/src/modules/reconciliation/reconciliation.service.ts`
- `api/src/modules/reports/reports.engine.ts`
- `api/src/modules/reports/reports.repository.ts`
- `api/src/modules/reports/reports.service.ts`
- `mobile/src/components/banking/ExistingSettlementPanel.tsx`
- `mobile/src/components/reports/FinancialReportWorkspace.tsx`
- `mobile/src/components/ui/SmartDatePicker.tsx`
- `mobile/src/screens/expenses/ExpenseEditScreen.tsx`
- `packages/contracts/src/reconciliation.ts`
- `packages/contracts/src/report-export.ts`
- `packages/contracts/src/report.ts`
- `src/components/payment/PaymentForm.tsx`
- `src/components/reconciliation/ReconciliationWorkspace.tsx`
- `src/features/reconciliation/api/reconciliationApi.ts`
- `src/pages/FinancialReportsPage.tsx`
- `src/services/reconciliationService.ts`
- `src/types/reconciliation.ts`

Reviewed production patch SHA256: `4f2cca72e1591a8a8d6b45f388f51e41d237cc4681469e46333ad3bb2442a080`. Subsequent edits require a delta review.
