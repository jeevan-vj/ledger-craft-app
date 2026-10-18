---
name: verify-api
description: LedgerCraft verify-api verification gate with bounded evidence and fail-closed behavior.
---

# verify-api

Validate Zod contracts and API tests. Do not claim live response compatibility without real HTTP checks.

Use `node scripts/verification/cli.mjs standard --check=verify-api` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
