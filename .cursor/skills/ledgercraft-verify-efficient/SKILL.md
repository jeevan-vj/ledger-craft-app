---
name: ledgercraft-verify-efficient
description: Select change-aware LedgerCraft checks and return compact machine-readable verification evidence without flooding agent context.
---

# Token-efficient LedgerCraft verification

Use after a coding change. This complements, never replaces, `ledgercraft-verify`, `ledgercraft-verify-ui`, and `ledgercraft-tdd`.

1. Run `node scripts/verification/cli.mjs fast` during iteration.
2. Run `node scripts/verification/cli.mjs standard` before handoff.
3. For PRs, fetch the base ref and run `VERIFY_BASE=origin/main node scripts/verification/cli.mjs pr`.
4. Read only `artifacts/verification/summary.json` first. Open the named failed check log only when investigating.
5. Never interpret `BLOCKED` as PASS. Accounting, authentication and database changes require explicit domain evidence, including isolated database and cross-organisation tests.
6. Never claim full UI proof from component tests. Use `ledgercraft-verify-ui` and Playwright for changed user journeys.
7. Never conceal known baseline failures; compare exact diagnostics before waiving anything. Existing CI is still authoritative.
8. Report status, changed areas, checks run, failures, missing evidence and commit SHA. Do not paste full passing logs.

The runner is deliberately conservative and currently an experimental first step. See `scripts/verification/README.md` for limitations.
