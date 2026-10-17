# Agent operations

Detail that does not fit in `AGENTS.md`. Current product status stays in `TARGET_ARCHITECTURE.md`. Cloudflare commands stay in `deploy/cloudflare.md`.

`Agents.md` was removed so a case-insensitive checkout has a single agent guide, `AGENTS.md`. The old file's Supabase Auth, Postgres-on-55432, Vercel, and per-wave SQL notes are not copied here. They described an earlier reconstruction stage.

## Start

1. `.cursor/skills/ledgercraft-bootstrap/SKILL.md`
2. `AGENTS.md`
3. `TARGET_ARCHITECTURE.md`
4. The matching skill under `.cursor/skills/`

W1–W13 are verified. Hono covers customers, business profile, items, invoices (send and remind), expenses, payments, accounts, journals, bank, reconciliation, tax, objects, receipts, receipt scan, conversations, and chat. Web and mobile email login use Better Auth. `@supabase/supabase-js` is not installed. TanStack Router and an `apps/` move wait until leftover stubbed client SQL is gone, and they stay out of a data cutover.

Launch specialists from `.cursor/skills/ledgercraft-agent-roster/SKILL.md`. Parent chat sequences the work.

## Skills

| Skill | Use |
| --- | --- |
| `.cursor/skills/ledgercraft-bootstrap/SKILL.md` | Session start |
| `.cursor/skills/ledgercraft-architecture/SKILL.md` | API, database, auth, providers |
| `.cursor/skills/ledgercraft-tdd/SKILL.md` | Test and implementation order |
| `.cursor/skills/verify/SKILL.md` | End-to-end proof for the current tree |
| `.cursor/skills/ledgercraft-verify/SKILL.md` | Older wave proof notes; prefer `verify` for a local run |
| `.cursor/skills/ledgercraft-verify-ui/SKILL.md` | Browser, screenshots, invoice PDF |
| `.cursor/skills/ledgercraft-web-ui/SKILL.md` | Revolut-inspired web UI |
| `.cursor/skills/ledgercraft-mobile-ui/SKILL.md` | Wise-inspired native UI |
| `.cursor/skills/ledgercraft-mobile-release/SKILL.md` | EAS iOS, TestFlight, App Store handoff |
| `.cursor/skills/ledgercraft-schema-rebuild/SKILL.md` | Schema from app types |
| `.cursor/skills/ledgercraft-vertical-slice/SKILL.md` | One domain onto Hono |
| `.cursor/skills/ledgercraft-agent-roster/SKILL.md` | Specialist prompts |
| `.cursor/skills/ledgercraft-knowledge-sync/SKILL.md` | Doc drift after a wave |

## Layout

```text
src/                     Vite web app
mobile/                  Expo SDK 54, npm, not in the pnpm workspace
api/                     Hono, Drizzle, Better Auth, SQLite
packages/contracts/      Zod DTOs
api/sqlite-migrations/   checksum-tracked SQL
deploy/cloudflare.md     Worker and Pages
```

Request path: client, Hono, use case, repository, Drizzle, SQLite. Ownership ids come from the session.

## Data rules that stay true

- Money is exact decimal text. Invoice create computes totals on the server. Client totals do not override them.
- `POST /api/invoices` accepts `Idempotency-Key`. The same key and body returns the original invoice. A reused key with a different body is `409 IDEMPOTENCY_CONFLICT`.
- Unauthenticated `/api/me` is `401` with the error envelope. Cross-organisation reads of a missing row are `404`.
- New SQLite SQL: `pnpm db:generate --name change`, then review. `pnpm db:migrate` is local-only. Production applies the bundled files on Durable Object startup.
- The signing secret in ignored `deploy/secrets.local.json` is reused. Do not rotate it as part of a routine change.
- Local API tests need Node 24. Node 22's `node:sqlite` has no `setReturnArrays`.
- Vitest sets domain flags false so leftover `supabase.from` call sites hit a local stub. Do not point those tests at a hosted project.
