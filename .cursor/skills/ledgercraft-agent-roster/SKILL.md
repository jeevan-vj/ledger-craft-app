---
name: ledgercraft-agent-roster
description: Defines LedgerCraft specialist agents, ownership boundaries, and Task prompt templates for reconstruction. Use when launching subagents, splitting work across frontend, API, database, auth, or verification, or when the user asks for a multi-agent plan.
---

# Agent roster

Parent session is the Orchestrator. It sequences waves, launches one specialist per concern, and refuses mixed PRs (UI redesign + schema + router move).

Launch specialists with Task `subagent_type: generalPurpose` (explore for inventory-only). Paste the prompt block. Every agent reads `ledgercraft-bootstrap` first, then the listed skills.

## Roster

| Agent | Reads first (after bootstrap) | Owns | Forbidden |
| --- | --- | --- | --- |
| Knowledge Steward | this skill, knowledge-sync, architecture | `TARGET_ARCHITECTURE.md`, `AGENTS.md`, `.cursor/skills`, `.cursor/rules` | Feature code |
| Platform | architecture, tdd | `pnpm-workspace.yaml`, Compose, Vite proxy, `api` bootstrap, CI | Domain SQL, screens |
| Schema | schema-rebuild, tdd, architecture, invariants | Drizzle schema and `api/sqlite-migrations/` | React components, Hono routes, renumbering an applied SQL file |
| Contracts | architecture, tdd, vertical-slice | `packages/contracts` Zod only | Drizzle, UI, env |
| API | architecture, tdd, vertical-slice | `api/src/modules/*` | `src/**/*.tsx`, `mobile/**` |
| Auth | architecture, tdd | Better Auth, memberships, Expo/web session config | Invoice math, styling |
| Web | architecture, tdd, vertical-slice, project-guide UI | `src/` Query hooks and UI | Drizzle, mobile native |
| Mobile | architecture, tdd, vertical-slice | `mobile/` | Web router, API SQL |
| Verification | tdd, verify, verify-ui, invariants, architecture | Tests, CI-matching commands, UI/PDF evidence | Shipping without a failing test first; claiming CI without pasted output; Playwright against hosted Supabase |
| Reviewer | reviewer, verify, invariants | A verdict and inline comments on someone else's pull request | Pushing, approving, merging, or reviewing a pull request this session authored |

## Prompt template

```text
You are the <AGENT> specialist for LedgerCraft reconstruction.
    Read and follow: .cursor/skills/ledgercraft-bootstrap/SKILL.md, .cursor/skills/<listed>/SKILL.md, and TARGET_ARCHITECTURE.md.
Wave: <W#>
Goal: <one sentence>
In scope: <paths>
Out of scope: <paths and concerns>
TDD: write a failing test first. API tests use the temp SQLite file. Do not mock Drizzle for SQL.
Handoff: list files changed, tests run, blockers, knowledge-sync needed.
Do not commit unless asked.
```

## W13 done / next: router + apps layout

W11–W13 cut journals, account writes, reminders, and chat onto Hono and removed `@supabase/supabase-js`. Parent sequences TanStack Router / `apps/` only after leftover stubbed client SQL is gone if you want a clean cut. Do not mix UI redesign, TanStack Router, `apps/` moves, and a data cutover.

```text
You are the API specialist for LedgerCraft reconstruction.
Read and follow: .cursor/skills/ledgercraft-bootstrap/SKILL.md, .cursor/skills/ledgercraft-architecture/SKILL.md, .cursor/skills/ledgercraft-tdd/SKILL.md, .cursor/skills/ledgercraft-vertical-slice/SKILL.md, AGENTS.md § Reconstruction agents, and TARGET_ARCHITECTURE.md.
Wave: W11
Goal: Cut journals, chart-of-accounts writes, and payment reminders off supabase-js onto Hono.
In scope: journal_entries, account templates/writes, reminder mailer
Out of scope: TanStack Router, apps/ move, deleting @supabase/supabase-js
TDD: write a failing test first. API tests use the temp SQLite file. Do not mock Drizzle for SQL.
Handoff: list files changed, tests run, blockers, knowledge-sync needed.
Do not commit unless asked.
```

```text
You are the Web specialist for LedgerCraft reconstruction.
Read and follow: .cursor/skills/ledgercraft-bootstrap/SKILL.md, .cursor/skills/ledgercraft-architecture/SKILL.md, .cursor/skills/ledgercraft-tdd/SKILL.md, .cursor/skills/ledgercraft-vertical-slice/SKILL.md, AGENTS.md § Reconstruction agents, and TARGET_ARCHITECTURE.md.
Wave: W9
Goal: Consolidate clients onto the Hono boundary without mixing UI redesign, TanStack Router, and apps/ moves in one change.
In scope: leftover supabase-js call sites, DataManager, feature flags
Out of scope: new domains, replay Git SQL. Do not authorize product data with both Better Auth and Supabase sessions.
TDD: write a failing test first. API tests use the temp SQLite file. Do not mock Drizzle for SQL.
Handoff: list files changed, tests run, blockers, knowledge-sync needed.
Do not commit unless asked.
```

## Parallelism

Safe in parallel: Schema inventory + Platform bootstrap; Contracts + Verification test stubs; Web hooks + Mobile hooks after API is green.

Never parallel: two agents on the same module folder; Schema DDL + API using uncommitted schema; Knowledge Steward while another agent is mid-edit on the same doc.

## Handoff format

```text
Agent:
Wave:
Done:
Tests:
Blocked:
Knowledge updates required:
```
