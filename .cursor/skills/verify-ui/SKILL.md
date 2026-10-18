---
name: verify-ui
description: LedgerCraft verify-ui verification gate with bounded evidence and fail-closed behavior.
---

# verify-ui

Run Playwright against a local isolated app. Capture screenshots/traces on failure and use the existing ledgercraft-verify-ui skill for invoice PDF flows.

Use `node scripts/verification/cli.mjs standard --check=verify-ui` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
