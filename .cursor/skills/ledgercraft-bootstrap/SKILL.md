---
name: ledgercraft-bootstrap
description: Start-here operating instructions for LedgerCraft. Use at the beginning of a session, before implementation, or when the user mentions reconstruction, Hono, verify, pnpm, or the agent router.
---

# LedgerCraft bootstrap

Read [`AGENTS.md`](../../../AGENTS.md). Then open the one row in [`docs/agent/CODEMAP.md`](../../../docs/agent/CODEMAP.md) for this task, plus [`docs/agent/WORKING.md`](../../../docs/agent/WORKING.md) if the task edits or reviews code.

Do not read `TARGET_ARCHITECTURE.md`, `AKAUNTING_FEATURE_PARITY_BACKLOG.md`, or the evidence diaries unless the task is architecture, parity, or a named acceptance replay. Those files still hold the long-form status. Issue #114 stays parked. The feature catalogue is not a blanket pass.

## First checks

```bash
node scripts/agent-preflight.mjs
```

Install only when the report says the tree is absent or stale, using the command it prints, on the Node major for the job (web and release readiness 22, API 24, mobile 20). Do not reuse `node_modules` across those majors. Native status `blocked` or `hold` means stop; do not boot an emulator or retry. Details: [`docs/agent/ENVIRONMENT.md`](../../../docs/agent/ENVIRONMENT.md).

Ports: API `3001`, Vite `8080`. Local SQLite comes from `DATABASE_URL`. Production data is in Durable Objects.

## Before a pull request

Follow `ledgercraft-verify` and paste the command output. The seven CI jobs stay required. Self-review with `ledgercraft-reviewer`. A different session does the independent review. The loop, including same-builder fixes and the two-round delta cap, is the Review loop section of `docs/PIPELINE.md`.

## Hard no

- Replay `supabase/migrations` or `migrations/*.sql`
- New client `supabase.from`, Storage SDK, Edge Function, or `VITE_OPENAI_*`
- Better Auth plus another session system both authorizing data
- UI redesign, TanStack Router, an `apps/` move, and a data cutover in one change
- Mock Drizzle in SQL or transaction tests
- Skip independent review or relax a CI gate
- Commit unless the user asked
