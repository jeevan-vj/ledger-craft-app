---
name: ledgercraft-check-gst
description: Verifies LedgerCraft gst settings and returns against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify gst settings and returns

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the gst settings and returns acceptance flow; it does not certify other features.

## Business-user flow

Confirm registration date/basis/frequency, prepare each supported basis, retain/revise draft, record synthetic external-filing reference, inspect immutable snapshot.

Start web at `/ird-reports`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

October working paper gives invoice 225, payments 180, hybrid 300. Pre-registration sources stay excluded; unknown mappings block filing. This is preparation and recording, not IRD submission.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/tax --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/tax/bank-reconciled-business.e2e.test.ts`
- `api/src/modules/tax/business-accounting.e2e.test.ts`
- `api/src/modules/tax/gst-calculation.test.ts`
- `api/src/modules/tax/gst-classification.test.ts`
- `api/src/modules/tax/gst-ird-scenario.e2e.test.ts`
- `api/src/modules/tax/gst-payments.test.ts`
- `api/src/modules/tax/gst-preparation.test.ts`
- `api/src/modules/tax/gst-registered-calculation.test.ts`
- `api/src/modules/tax/gst-registration-reversals.test.ts`
- `api/src/modules/tax/gst-self-filing.e2e.test.ts`
- `api/src/modules/tax/gst-settings.test.ts`
- `api/src/modules/tax/tax-completion.e2e.test.ts`
- `api/src/modules/tax/tax.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/gst/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

## Reusable UI drivers

- `scripts/full-month-close-web-proof.mjs` — stages gst. real business UI; shared sequential month-close scenario.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.
