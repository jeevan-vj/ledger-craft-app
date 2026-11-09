# AGENTS.md

Operating router for EasyBizInvoice (`ledger-craft-app`). Read this file, then only the task row in [`docs/agent/CODEMAP.md`](docs/agent/CODEMAP.md). Procedures that do not fit a row are linked below. Dated acceptance narratives stay in [`docs/evidence/`](docs/evidence/) and the status section of [`TARGET_ARCHITECTURE.md`](TARGET_ARCHITECTURE.md). The feature catalogue in [`docs/feature-verification.md`](docs/feature-verification.md) is a verification specification, not a blanket pass. Issue #114 stays parked.

## Stack

Pages project `ledger-craft-app` serves the Vite app. The Hono Worker `ledgercraft-api` routes to SQLite Durable Objects: one Identity object and one Ledger object per organisation. Local Node API uses SQLite (`DATABASE_URL`). API **3001**. Vite **8080** proxies `/api`. Web and mobile email login use Better Auth (`/api/auth/*`). Product data uses Hono only. Shared Zod DTOs are `@ledgercraft/contracts`. `mobile/` is Expo SDK 54 and is not in the pnpm workspace.

Request path: Client → Hono → use case → repository → Drizzle → SQLite. DTOs from Zod. Ownership ids come from the session membership, never the body.

## Safety that stays in force

- Persist money as decimal text. Invoice and quote totals use `computeInvoiceTotals`. Rounding uses `roundMoney`. Reports come from posted journals. Details and the calendar-day rules are [`.cursor/skills/ledgercraft-invariants/SKILL.md`](.cursor/skills/ledgercraft-invariants/SKILL.md). Do not reimplement them.
- Quotes do not post journals. Drafts do not post. Do not authorize product data with both Better Auth and a second session system.
- Do not add `supabase.from`, the Storage SDK, Edge Functions, or client `VITE_OPENAI_*`. Do not replay `supabase/migrations/` or `migrations/*.sql`.
- New SQL is an approved, additive file under `api/sqlite-migrations/`. Applied files stay byte-for-byte. The next number is the next prefix in that directory, not a remembered “latest”.
- Do not mix a UI redesign, TanStack Router, an `apps/` move, and a data cutover.
- Independent review, the seven CI jobs, and the merge rules in [`docs/PIPELINE.md`](docs/PIPELINE.md) stay as written. Do not skip review, relax a zero-error gate, or start a third delta re-review. The same builder applies review fixes. A delta re-review is capped at two rounds.
- Do not merge, deploy, or enable auto-merge unless the user asks. `review-passed` and `auto-merge-eligible` are not applied by the author. Maestro flows, EAS, emulator boots, and production tests are on hold; [`docs/agent/ENVIRONMENT.md`](docs/agent/ENVIRONMENT.md) says how a missing runner is reported.

## Where to go

| Need | Open |
| --- | --- |
| Which files to edit | [`docs/agent/CODEMAP.md`](docs/agent/CODEMAP.md) |
| How to work without flooding context | [`docs/agent/WORKING.md`](docs/agent/WORKING.md) |
| API, mobile, test, or review shape | [`docs/agent/recipes/`](docs/agent/recipes/) |
| Exact test command | [`docs/agent/TEST_MATRIX.md`](docs/agent/TEST_MATRIX.md) |
| Node, install, emulator | [`docs/agent/ENVIRONMENT.md`](docs/agent/ENVIRONMENT.md) |
| Task or review handoff | [`docs/agent/TASK_PACKET.md`](docs/agent/TASK_PACKET.md), [`docs/agent/REVIEW_PACKET.md`](docs/agent/REVIEW_PACKET.md) |
| Money, GST, dates, idempotency, migrations | `ledgercraft-invariants` |
| Before a pull request | `ledgercraft-verify` |
| UI evidence | `ledgercraft-verify-ui` |
| Review verdict | `ledgercraft-reviewer` and the Review loop in `docs/PIPELINE.md` |
| Efficiency measurement | [`docs/agent/EFFICIENCY.md`](docs/agent/EFFICIENCY.md) |

Architecture tasks also read `TARGET_ARCHITECTURE.md`. Parity tasks also read `docs/akaunting-parity-gate.md` and `AKAUNTING_FEATURE_PARITY_BACKLOG.md`. A scoped bug, UI, or API task does not start by reading those files end to end.

## Commands

Run [`node scripts/agent-preflight.mjs`](scripts/agent-preflight.mjs) before reusing `node_modules`. Install only when it says the tree is absent or stale, on the Node major for that job.

| Job | Node | Full command |
| --- | --- | --- |
| Web lint, typecheck, unit, build, release readiness | 22 | `ledgercraft-verify` |
| API and contracts | 24 | `pnpm test:api && pnpm test:contracts && pnpm type-check:api` |
| Mobile | 20 | `npm ci` in `mobile/`, then the Mobile job in `ledgercraft-verify` |

Those full commands remain required CI. Pass a filename to `pnpm test:api`, `pnpm test:contracts`, `pnpm test:run`, or mobile `npm test`. They call `scripts/targeted-test.mjs`, which removes the extra `--` pnpm inserts and checks the reported file count. A raw `vitest run -- some.test.ts` still runs the whole include set, because that `--` drops the filename. See [`docs/agent/TEST_MATRIX.md`](docs/agent/TEST_MATRIX.md).

```bash
pnpm test:api -- src/modules/sales/sales.test.ts
pnpm test:contracts -- src/sale.test.ts
pnpm test:run -- src/pages/Settings.test.tsx
cd mobile && npm test -- src/screens/sales/SellScreen.test.tsx
```

`pnpm dev:api` is `127.0.0.1:3001`. `pnpm dev` is Vite `:8080`. Package manager is pnpm `11.19.0`. Mobile uses npm and `mobile/package-lock.json`.

## Layout

```text
src/                     Vite web app
mobile/                  Expo app (own lockfile)
api/                     Hono, Drizzle, Vitest
api/sqlite-migrations/   reviewed SQLite migrations
packages/contracts/      Zod DTOs
functions/api/[[path]].ts
deploy/api/wrangler.jsonc
docs/agent/              task router, recipes, measurement
.cursor/skills/          procedures
```

Leave `src/` and `mobile/` where they are until a change is only about moving them.

## Skills

| Skill | When |
| --- | --- |
| `ledgercraft-architecture` | API, database, auth, storage, email, AI |
| `ledgercraft-tdd` | Failing test before production code, including bug fixes |
| `ledgercraft-verify` | CI-matching commands and the evidence table |
| `ledgercraft-invariants` | Money, GST, totals, dates, share tokens, idempotency, migrations |
| `ledgercraft-verify-ui` | Web, PDF, and Expo UI evidence |
| `ledgercraft-reviewer` | Review checklist. The loop is `docs/PIPELINE.md` |
| `ledgercraft-web-ui` | Web UI. `DESIGN.md` wins over older examples |
| `ledgercraft-mobile-ui` | Expo UI. Lime actions use forest text, never white |
| `ledgercraft-knowledge-sync` | After a wave, when status or commands drift |
| `ledgercraft-bootstrap` | Short session start. It points here |

Domain acceptance skills are indexed from [`docs/feature-verification.md`](docs/feature-verification.md). Open the one row the task names.

## Hard no

- Replay historical SQL or edit an applied migration
- New client Supabase, Edge Function, or `VITE_OPENAI_*` call
- Mock Drizzle in SQL or transaction tests
- A second auth session beside Better Auth
- Weaken a CI gate, skip independent review, or merge to finish a task
- Commit raw agent transcripts, reasoning, credentials, or customer data
