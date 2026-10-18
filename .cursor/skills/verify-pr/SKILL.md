---
name: verify-pr
description: LedgerCraft verify-pr verification gate with bounded evidence and fail-closed behavior.
---

# verify-pr

Aggregate required evidence for the current head SHA. A passing subset of checks is not approval; all required domain gates must be complete.

Use `node scripts/verification/cli.mjs standard --check=verify-pr` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
