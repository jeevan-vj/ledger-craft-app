---
name: verify-tests
description: LedgerCraft verify-tests verification gate with bounded evidence and fail-closed behavior.
---

# verify-tests

Run unit tests and relevant integration tests; summarize failures. Do not confuse mocked unit tests with database integration evidence.

Use `node scripts/verification/cli.mjs standard --check=verify-tests` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
