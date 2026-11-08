---
name: ledgercraft-check-journals
description: Verifies LedgerCraft chart of accounts and journals against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify chart of accounts and journals

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the chart of accounts and journals acceptance flow; it does not certify other features.

## Business-user flow

Create accounts, post reviewed opening balances and multiline journal, retry, inspect/export every line; reject imbalance.

Start web at `/journal-entries`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Debits equal credits exactly; posted entries immutable; opening and period turnover are distinct from closing balance.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/journals src/modules/accounts --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/journals/journal-idempotency.test.ts`
- `api/src/modules/journals/journals.test.ts`
- `api/src/modules/journals/multi-line-journals.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/journals/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

Related boundary suites:
- `api/src/modules/accounts/accounts.test.ts`

## Reusable UI drivers

- `scripts/full-month-close-web-proof.mjs` — stages signup. real business UI; shared sequential month-close scenario.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.
