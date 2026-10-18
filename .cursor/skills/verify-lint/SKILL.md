---
name: verify-lint
description: LedgerCraft verify-lint verification gate with bounded evidence and fail-closed behavior.
---

# verify-lint

Check changed-file lint first during iteration. Existing runner currently invokes whole-project ESLint; diagnostic baseline reconciliation remains required.

Use `node scripts/verification/cli.mjs standard --check=verify-lint` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
