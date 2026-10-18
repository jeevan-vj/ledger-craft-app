---
name: verify-database
description: LedgerCraft verify-database verification gate with bounded evidence and fail-closed behavior.
---

# verify-database

Require disposable PostgreSQL, migrations and cross-organisation isolation evidence. Never run migrations against production.

Use `node scripts/verification/cli.mjs standard --check=verify-database` for the current targeted command, and inspect `artifacts/verification/summary.json`. This is a single-check diagnostic invocation, not full PR readiness. Do not claim PASS when required checks are missing, blocked or not implemented. For final approval run the PR profile and existing CI. Read detailed logs only for failing checks.
