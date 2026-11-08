---
name: ledgercraft-check-invoices
description: Verifies LedgerCraft invoice lifecycle against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify invoice lifecycle

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the invoice lifecycle acceptance flow; it does not certify other features.

## Business-user flow

Create a draft with discounts and multiple taxes, reload, issue, duplicate, cancel and restore; inspect audit history.

Start web at `/invoices`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Server totals win; drafts do not post; cancellation/restoration is balanced and immutable; explicit exempt taxes remain empty.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/invoices --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/invoices/email-delivery.e2e.test.ts`
- `api/src/modules/invoices/invoice-delivery-current-state.test.ts`
- `api/src/modules/invoices/invoice-gst-compliance.test.ts`
- `api/src/modules/invoices/invoice-lifecycle.test.ts`
- `api/src/modules/invoices/invoices.remind.test.ts`
- `api/src/modules/invoices/invoices.test.ts`
- `api/src/modules/invoices/mailer.test.ts`
- `api/src/modules/invoices/money.test.ts`
- `api/src/modules/invoices/overdue.test.ts`
- `api/src/modules/invoices/resend.test.ts`
- `api/src/modules/invoices/restore-repair.test.ts`
- `api/src/modules/invoices/share.test.ts`
- `api/src/modules/invoices/totals.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/invoices/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

## Reusable UI drivers

- `scripts/full-month-close-web-proof.mjs` — stages invoices. real business UI; shared sequential month-close scenario.
- `tests/e2e/invoice-sharing-controls-local.spec.ts`. read driver setup and evidence boundaries before running.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.
