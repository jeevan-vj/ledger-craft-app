---
name: ledgercraft-check-stripe
description: Verifies LedgerCraft stripe payment operations against local Hono persistence and business/accounting expectations, with fresh UI screenshots and explicit evidence gaps.
---

# Verify stripe payment operations

Read `docs/feature-verification.md` for the common execution and evidence contract. This skill owns the stripe payment operations acceptance flow; it does not certify other features.

## Business-user flow

Use local mock onboarding/Checkout, deliver signed duplicate events, inspect settlement/refund and read-only daily verification; test unavailable capability.

Start web at `/settings`; check `src/routes.tsx` for current routes. Use the corresponding Expo screen where present. Run with fresh synthetic companies on loopback only. Label API setup and provider mocks explicitly.

## Accountant and expert acceptance

Verified event creates one payment/clearing posting; paid capture is not bank payout; payout/dispute/excess-capture gaps remain explicit.

Exercise empty, validation-error and success states. Reload the saved result and compare authenticated read-back to the independently specified expectation. Test forbidden access and a retry at the integration boundary. A screenshot alone does not confirm accounting correctness.

## Automated checks

From the repository root, run:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/stripe --maxWorkers=1
```

Inspect the related web/Expo tests before changing their behavior. Record actual exit codes, counts, Node version and source SHA. Existing test files:

- `api/src/modules/stripe/stripe.fees.test.ts`
- `api/src/modules/stripe/stripe.guardrails.test.ts`
- `api/src/modules/stripe/stripe.integration.test.ts`
- `api/src/modules/stripe/stripe.mock-gateway.test.ts`
- `api/src/modules/stripe/stripe.operations.test.ts`
- `api/src/modules/stripe/stripe.real-gateway.test.ts`
- `api/src/modules/stripe/stripe.signature.test.ts`

## Screenshot confirmation

Capture the completed flow and persisted reload at 1440x900 and 390x844 for web, and separately label Expo web or native device. Save under `docs/evidence/feature-verification/<run>/stripe/`. Each image needs action, expected result, observed result, source identity, date and platform in the run ledger. Redact session/share tokens and personal data. Show the image in the final report.

Use statuses `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` separately for API, web UI, Expo UI, device and provider. If any required flow is unrun, do not mark this feature wholly passed. Record a reproducible confirmed defect against existing GitHub issues before creating a duplicate; follow repository test-first fixes and rerun the failed flow.
