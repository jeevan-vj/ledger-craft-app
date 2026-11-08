---
name: ledgercraft-check-reconciliation
description: Verifies LedgerCraft bank reconciliation against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify bank reconciliation

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the bank reconciliation acceptance flow; it does not certify other features.

## Business-user flow

Match bank lines to existing invoice receipts, supplier payment, paid expense and customer refund; undo/rematch and complete.

Start web at `/reconciliation`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

No second income/GST/cash posting; completed cutoff and linked account identity are protected; difference is zero.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/reconciliation --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/reconciliation/bank-reconciliation-phase1.test.ts`
- `api/src/modules/reconciliation/foreign-bank-guard.test.ts`
- `api/src/modules/reconciliation/reconciliation-summary.test.ts`
- `api/src/modules/reconciliation/reconciliation.test.ts`
- `api/src/modules/reconciliation/statement-adjustments.test.ts`
- `api/src/modules/reconciliation/statement-idempotency.test.ts`
- `api/src/modules/reconciliation/suggestion-scoring.test.ts`
- `api/src/modules/reconciliation/supplier-payment-match.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/reconciliation/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

## Reusable UI drivers

- `scripts/full-month-close-web-proof.mjs` — stages bank. real business UI; shared sequential month-close scenario.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.
