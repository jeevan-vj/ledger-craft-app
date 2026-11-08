---
name: ledgercraft-check-bank-feeds
description: Verifies LedgerCraft bank feed connections against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify bank feed connections

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the bank feed connections acceptance flow; it does not certify other features.

## Business-user flow

Test disabled capability, internal Personal App gate, mocked import retry and disconnect; verify tenant scoping.

Start web at `/bank-accounts`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Never claim Full App OAuth/accreditation or live bank proof from mocks; credentials remain server-only.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/bank-feeds --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/bank-feeds/akahu.gateway.test.ts`
- `api/src/modules/bank-feeds/bank-feeds.http.test.ts`
- `api/src/modules/bank-feeds/bank-feeds.migration.test.ts`
- `api/src/modules/bank-feeds/bank-feeds.service.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/bank-feeds/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

## Reusable UI drivers

- `scripts/issue115-bankfeeds-proof.mjs`. read driver setup and evidence boundaries before running.

Follow prerequisite stages and use a fresh isolated output directory. Driver availability is not a recorded pass.
