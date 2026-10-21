# AGENTS.md

Operating guide for EasyBizInvoice (`ledger-craft-app`). This file replaces `Agents.md`, `CLAUDE.md`, and `GEMINI.md`. There is no `.cursorrules` file.

Spec: `TARGET_ARCHITECTURE.md`. Deployment runbook: `deploy/cloudflare.md`. Session skill: `.cursor/skills/ledgercraft-bootstrap/SKILL.md`.

## Stack that is current

Pages project `ledger-craft-app` serves the Vite app. The Hono Worker `ledgercraft-api` (`deploy/api/worker.ts`, config `deploy/api/wrangler.jsonc`) routes to SQLite Durable Objects: one Identity object for Better Auth users, emails, and sessions, and one Ledger object per organisation. The Pages Function `functions/api/[[path]].ts` proxies `/api/*`.

Local Node API uses SQLite (`api/src/db/local.ts`). Reviewed SQL is `api/sqlite-migrations/*.sql`, checksum-tracked, applied on Durable Object startup inside `storage.transactionSync`. `pnpm db:migrate` writes that SQL to the local file only.

Web and mobile email login and signup use Better Auth (`/api/auth/*`). Product reads and writes go through Hono. `@supabase/supabase-js` is not a workspace or mobile dependency. `src/integrations/supabase/client.ts` is a local stub used by leftover call sites and Vitest.

Shared Zod DTOs live in `packages/contracts`. Web imports them as `@ledgercraft/contracts`.

`mobile/` is Expo SDK 54 and is not in `pnpm-workspace.yaml`. CI installs it with `npm ci` and `mobile/package-lock.json`.

Web UI follows `DESIGN.md` and `.cursor/skills/ledgercraft-web-ui/SKILL.md`. Mobile UI follows `.cursor/skills/ledgercraft-mobile-ui/SKILL.md` (Wise lime/forest, native iOS chrome). `.cursor/rules/project-guide.mdc` still contains older Supabase and Revolut examples; the files named above supersede those examples.

## Layout

```text
src/                         Vite web app
mobile/                      Expo app (npm, own lockfile)
api/                         Hono API, Drizzle schema, Vitest
api/sqlite-migrations/       reviewed SQLite migrations
packages/contracts/          Zod DTOs
functions/api/[[path]].ts    Pages /api proxy
deploy/api/wrangler.jsonc    Worker + Durable Objects
deploy/cloudflare.md         release runbook
docs/sentry-web.md           web Sentry setup
```

Leave `src/` and `mobile/` where they are until a change is only about moving them. Do not combine a TanStack Router migration, an `apps/` move, a UI redesign, and a data cutover.

## Commands

Package manager for the workspace is pnpm `11.19.0`. Lockfile: `pnpm-lock.yaml`.

```bash
pnpm install --frozen-lockfile
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm db:migrate
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm dev:api   # 127.0.0.1:3001
pnpm dev                                                      # Vite :8080, proxies /api
pnpm test:run
pnpm test:api
pnpm test:contracts
pnpm type-check
pnpm type-check:api
pnpm lint
pnpm build
pnpm verify:w1            # contracts tests, API tests, API + contracts typecheck
pnpm run deploy:check     # Node 24+. Local checks and Wrangler dry run
pnpm run deploy:cloudflare
pnpm run deploy:help
pnpm db:generate --name describe_the_change
```

`pnpm dev:stack` and `pnpm start` run `scripts/dev.sh`, which starts Docker Postgres on port 55432 and then the API and Vite. `.env.example` still documents those Postgres URLs. The Node API opens SQLite.

Mobile, from `mobile/`:

```bash
npm ci
npm start
npm test
npm run lint
npm run type-check
npx expo export --platform ios
```

`EXPO_PUBLIC_API_URL` defaults to `http://127.0.0.1:3001`.

Worker local dev, from the runbook:

```bash
pnpm exec wrangler dev --config deploy/api/wrangler.jsonc
```

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. Web jobs use Node 22 and `pnpm install --frozen-lockfile`, then lint, `tsc` for `tsconfig.app.json` and `tsconfig.node.json`, `pnpm test:run`, and `pnpm build`. Mobile uses Node 20, `npm ci`, ESLint, `tsc --noEmit`, Jest, and `npx expo export --platform ios`. Web lint, web typecheck, mobile lint, mobile typecheck, and mobile Jest compare counts with baselines in that workflow. The count gate fails when the count rises. A separate job runs `node --test .github/scripts/verify-api-readiness.test.mjs`.

`.github/workflows/release.yml` deploys on push to `main` with Node 24. It preserves the existing Worker `BETTER_AUTH_SECRET`.

## Monitoring

Web: `docs/sentry-web.md`. Browser events require `VITE_SENTRY_DSN` at build time. Source maps upload from the release workflow when `SENTRY_AUTH_TOKEN` is set, then `dist/**/*.map` is deleted before Pages deploy.

API: `deploy/cloudflare.md` section "Error monitoring (Sentry)". `@sentry/cloudflare` sends Worker events only when `SENTRY_ENVIRONMENT` is `production`. The public DSN is the `SENTRY_DSN` var in `deploy/api/wrangler.jsonc`. Project slug `ledgercraft-api`, org `ledgercraft`.

`mobile/SENTRY.md` is absent. The Expo app has no Sentry dependency.

## Data rules

- Client → Hono → use case → repository → Drizzle → SQLite.
- DTOs come from `packages/contracts`. Clients do not import Drizzle types.
- `user_id` and `organisation_id` come from the session or membership, not the request body.
- Money stays exact decimal text. GST and invoice totals stay on the server helpers that already compute them.
- New SQLite SQL is generated, reviewed, and appended under `api/sqlite-migrations/`. Applied files stay byte-for-byte. `pnpm db:generate` then `pnpm deploy:cloudflare` is the production path. There is no D1 migrate step.
- `supabase/` remains in the tree. `TARGET_ARCHITECTURE.md`, `AI_CONVERSATION_IMPLEMENTATION.md`, and `.cursor/skills/ledgercraft-schema-rebuild/SKILL.md` still name `supabase/migrations/`. Those files are historical hints. Do not replay them, and do not replay `migrations/*.sql`, onto the current database.
- Do not add `supabase.from`, the Storage SDK, Edge Functions, client `VITE_OPENAI_*`, or a second session system beside Better Auth.
- `api/.data/` is the local object-store default (`OBJECT_STORE_DIR` or `api/.data/objects`). It is gitignored.

## Skills

| Skill | When |
| --- | --- |
| `.cursor/skills/ledgercraft-bootstrap/SKILL.md` | Session start |
| `.cursor/skills/ledgercraft-architecture/SKILL.md` | API, database, auth, storage, email, AI |
| `.cursor/skills/ledgercraft-tdd/SKILL.md` | Tests before production code |
| `.cursor/skills/ledgercraft-verify/SKILL.md` | Prove a slice with tests and live HTTP |
| `.cursor/skills/ledgercraft-verify-ui/SKILL.md` | Browser and invoice PDF |
| `.cursor/skills/ledgercraft-web-ui/SKILL.md` | Web UI |
| `.cursor/skills/ledgercraft-mobile-ui/SKILL.md` | Expo UI |
| `.cursor/skills/ledgercraft-mobile-release/SKILL.md` | EAS, TestFlight, App Store Connect |
| `.cursor/skills/ledgercraft-mobile-loop/SKILL.md` | Repeated mobile backlog cycle |
| `.cursor/skills/ledgercraft-schema-rebuild/SKILL.md` | Schema reconstruction |
| `.cursor/skills/ledgercraft-vertical-slice/SKILL.md` | One domain onto Hono |
| `.cursor/skills/ledgercraft-agent-roster/SKILL.md` | Splitting work across specialist agents |
| `.cursor/skills/ledgercraft-knowledge-sync/SKILL.md` | After a wave, when docs drift |

Parent chat is the orchestrator. Launch specialists from the roster skill. After a wave, update present-tense facts in `TARGET_ARCHITECTURE.md` and this file.

Feature parity that is still open is tracked in `AKAUNTING_FEATURE_PARITY_BACKLOG.md`. Release evidence for the published Cloudflare app is the dated sections of `deploy/cloudflare.md`.
