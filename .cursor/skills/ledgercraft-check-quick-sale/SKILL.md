---
name: ledgercraft-check-quick-sale
description: Verifies LedgerCraft quick sale against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify quick sale

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the quick sale acceptance flow; it does not certify other features.

## Business-user flow

On Expo enable Sell, arrange tiles, charge cart, double-tap/retry, view/share receipt, inspect day summary and offline error.

Start web at `/invoices`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

One invoice/full payment/receipt per persisted cart key; daily gross equals method totals; once-rounded cart total; named customer sale remains in day summary.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/sales --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/sales/sales-flow.test.ts`
- `api/src/modules/sales/sales-summary.test.ts`
- `api/src/modules/sales/sales.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/quick-sale/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

## Reusable UI driver

`scripts/quick-sale-mobile-screens.mjs` accepts `QUICK_SALE_MOBILE_URL`, `QUICK_SALE_API_URL`, and `QUICK_SALE_OUTPUT_DIR`. It creates synthetic fixtures through the API and executes Sell/cart/receipt/day-summary operations through Expo web. Run against loopback services; native share and device QA remain separate.
