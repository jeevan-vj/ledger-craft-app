---
name: ledgercraft-check-payments
description: Verifies LedgerCraft payments and receipts against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify payments and receipts

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the payments and receipts acceptance flow; it does not certify other features.

## Business-user flow

Part-pay an issued invoice, retry the same key, attempt overpayment, settle, inspect receipt, reverse with a dated reason.

Start web at `/payments`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Exactly one receipt/journal per accepted payment; balance cannot go negative; reversal preserves original payment and receipt.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/payments src/modules/receipts --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/payments/payment-credit-state.test.ts`
- `api/src/modules/payments/payments.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/payments/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

Related boundary suites:
- `api/src/modules/receipts/receipts.test.ts`

## Reusable UI drivers

- `scripts/full-month-close-web-proof.mjs` — stages receipts. real business UI; shared sequential month-close scenario.
- `scripts/payment-refresh-proof.mjs`. read driver setup and evidence boundaries before running.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.
