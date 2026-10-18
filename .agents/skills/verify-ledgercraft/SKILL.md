---
name: verify-ledgercraft
description: Orchestrate deterministic LedgerCraft checks and evidence-based live user journey verification.
---

# LedgerCraft application verification

This is the single agent-facing entrypoint. Existing `.cursor/skills/ledgercraft-verify` and `ledgercraft-verify-ui` contain app-specific procedures. The eight `verify-*` skills are individual engineering checks, not alternative orchestration engines.

1. Run `node scripts/verification/doctor.mjs` and resolve blocked prerequisites. An occupied port is not proof the service is healthy.
2. Read `references/features/README.md`, then only the relevant feature reference. Never scan all source files to rediscover routes.
3. Run `node scripts/verification/cli.mjs fast` during development and `node scripts/verification/cli.mjs pr` before handoff.
4. For user-facing changes, launch isolated API/Vite/Postgres from the existing repository scripts and verify health endpoints; do not reuse another agent's unknown service.
5. Drive the affected workflow using Playwright, asserting behavior and persistence. Save failure screenshots and traces. Label mock-only evidence honestly.
6. Report executed checks, observed assertions, gaps, evidence paths, commit SHA and whether environment cleanup succeeded.
7. Never claim a PR is verified if required database, security or accounting checks are blocked. Never run against production.

Do not mutate existing `main` worktrees, share test databases across concurrent agents, or automatically approve/merge PRs.
