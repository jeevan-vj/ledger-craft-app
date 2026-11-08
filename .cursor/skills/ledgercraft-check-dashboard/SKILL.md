---
name: ledgercraft-check-dashboard
description: Verifies LedgerCraft dashboard and saved reports against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify dashboard and saved reports

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the dashboard and saved reports acceptance flow; it does not certify other features.

## Business-user flow

Change layout, save filter, reload/switch company, open linked source and compare summary to posted reports.

Start web at `/`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Operational activity is distinguished from ledger totals; per-user layouts and company-scoped saved filters do not leak.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/dashboard --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/dashboard/dashboard.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/dashboard/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.

## Calendar cutoff driver

Run `scripts/dashboard-calendar-proof.mjs` with `PROOF_SESSION`, `PROOF_OUTPUT` and optionally `CLOSE_WEB_URL`. It checks actual daily and monthly report requests in Auckland and UTC against a selected October31 cutoff, then captures desktop/phone screenshots. It does not verify all saved-layout interactions.
