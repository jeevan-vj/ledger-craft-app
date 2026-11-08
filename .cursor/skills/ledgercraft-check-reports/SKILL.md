---
name: ledgercraft-check-reports
description: Verifies LedgerCraft financial reports and dashboards against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify financial reports and dashboards

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the financial reports and dashboards acceptance flow; it does not certify other features.

## Business-user flow

Run accrual/cash P&L, balance sheet, trial balance, cash flow, aging and monthly/quarterly columns; export PDF/CSV; settle next month and rerun prior month.

Start web at `/financial-reports`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Use frozen Decimal working paper: TB 13680 each side, assets 12480 = liabilities 980 + equity 11500, profit 1500, cash 11380, AR 920, AP 575. Cash profit 1200; later settlement does not alter historical close.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/reports --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/reports/account-statement-opening.test.ts`
- `api/src/modules/reports/accountant-month-close.e2e.test.ts`
- `api/src/modules/reports/cash-flow-reconciliation.test.ts`
- `api/src/modules/reports/cash-recognition-history.test.ts`
- `api/src/modules/reports/cash-recognition-invalid-source.test.ts`
- `api/src/modules/reports/cash-report-receipts.test.ts`
- `api/src/modules/reports/full-month-close.e2e.test.ts`
- `api/src/modules/reports/report-columns.test.ts`
- `api/src/modules/reports/report-options.test.ts`
- `api/src/modules/reports/reports-aging-history.test.ts`
- `api/src/modules/reports/reports.test.ts`
- `api/src/modules/reports/trial-balance-signs.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/reports/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

## Reusable UI drivers

- `scripts/full-month-close-web-proof.mjs` — stages reports. real business UI; shared sequential month-close scenario.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.

## Main integration: self-service close controls

Download an authenticated accountant ZIP; verify report membership, SHA-256 checksums and reports/banking permission boundaries.

Run these additional integration files as part of this domain:

- `api/src/modules/reports/close-pack.test.ts`

The feature entered main at `8f6bb6866c27a5fed5f9a1aa1caa728e16a94d4f`. Prior screenshot evidence is in `docs/evidence/self-service-month-close/README.md`; it is historical evidence, not a new run of this skill. Record fresh UI results separately.
