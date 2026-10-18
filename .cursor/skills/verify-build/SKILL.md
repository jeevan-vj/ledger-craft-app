---
name: verify-build
description: LedgerCraft verify-build verification gate with bounded evidence and fail-closed behavior.
---

# verify-build

Run production compilation and TypeScript checks. Current runner build and typecheck are separate commands; inspect both before reporting compilation success.

Use `node scripts/verification/cli.mjs standard --check=verify-build` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
