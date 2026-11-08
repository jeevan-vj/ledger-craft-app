---
name: ledgercraft-check-imports
description: Verifies LedgerCraft invoice and document imports against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify invoice and document imports

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the invoice and document imports acceptance flow; it does not certify other features.

## Business-user flow

Import PDF/photo, review extracted lines/contact/duplicate, choose sales or purchase, commit draft, inspect locked original; reject over-limit and malicious input.

Start web at `/invoices/import`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Only reviewed drafts are committed; no send/pay/post side effect; exact cents and document prompt boundaries hold; unavailable provider is visible.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/invoice-imports src/modules/storage --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/invoice-imports/draft-validation.test.ts`
- `api/src/modules/invoice-imports/extraction/extraction.test.ts`
- `api/src/modules/invoice-imports/invoice-import-validation.test.ts`
- `api/src/modules/invoice-imports/invoice-imports-accounting.e2e.test.ts`
- `api/src/modules/invoice-imports/invoice-imports-phase2.test.ts`
- `api/src/modules/invoice-imports/invoice-imports.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/imports/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

Related boundary suites:
- `api/src/modules/storage/file-storage.test.ts`
- `api/src/modules/storage/keys.test.ts`
- `api/src/modules/storage/objects.test.ts`

## Reusable UI drivers

- `scripts/issue115-receipts-proof.mjs`. read driver setup and evidence boundaries before running.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.
