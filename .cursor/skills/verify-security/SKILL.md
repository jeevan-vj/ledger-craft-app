---
name: verify-security
description: LedgerCraft verify-security verification gate with bounded evidence and fail-closed behavior.
---

# verify-security

Audit authentication, authorization, secrets, dependencies and tenant isolation. This gate is NOT automated yet; runner must block rather than pass.

Use `node scripts/verification/cli.mjs standard --check=verify-security` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
