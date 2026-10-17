# AGENTS.md

Operating brief for LedgerCraft. Spec: `TARGET_ARCHITECTURE.md`. Deploy: `deploy/cloudflare.md`. Skills and the specialist roster: `docs/agent-operations.md`. Prove a change with `.cursor/skills/verify/SKILL.md`.

## Boundaries

- Web: Vite + React in `src/`. `pnpm dev` serves **8080** and proxies `/api` to the API (`vite.config.ts`). Web UI stays Revolut-inspired.
- API: Hono in `api/` (`@ledgercraft/api`) with Better Auth at `/api/auth/*`. `pnpm dev:api` listens on **127.0.0.1:3001**. Local data is SQLite through `node:sqlite` (`api/src/db/local.ts`). Production is Cloudflare Pages plus the Hono Worker, with Identity and per-organisation Ledger SQLite Durable Objects. Uploads are SQLite attachments capped at 1 MB. Reviewed `api/sqlite-migrations/*.sql` are checksum-tracked.
- Contracts: `packages/contracts` (`@ledgercraft/contracts`). Zod DTOs only. Do not send Drizzle types to clients. API errors use `{ error: { code, message, requestId } }`.
- Workspace: pnpm **11.19.0** (`package.json` `packageManager`). Members are `api` and `packages/contracts` (`pnpm-workspace.yaml`). The root package is the Vite app.
- Mobile: Expo SDK **54** (`expo ~54.0.20`) in `mobile/`. It is not a workspace member. Install and scripts use npm (`mobile/package-lock.json`).
- Supabase is retired. Do not add `@supabase/supabase-js`, client SQL, Storage, or Edge Functions. `.env.example` still shows Postgres URLs; `createDb` rejects any `DATABASE_URL` that is not a SQLite filename or `file:` URL.
- EAS identity is fixed: owner `@jeevan90`, slug `easybizinvoice-mobile`, projectId `7148323b-502c-447e-96c3-a5c1704c40c9` (`mobile/app.config.js`). Do not change them.

## Commands

API tests need Node **24**. Node 22 lacks `setReturnArrays` (and `statement.columns()`), so `pnpm test:api` fails on Node 22. `api/src/db/local.ts` calls both.

Root:

```bash
pnpm install
pnpm lint
pnpm type-check
pnpm type-check:api
pnpm test:contracts
pnpm test:run
pnpm test:api
pnpm build
```

`pnpm test` is Vitest watch mode. The one-shot web suite is `pnpm test:run`. `pnpm build` rewrites `public/version.json`; do not commit that unless a version bump is the task.

`mobile/`:

```bash
npm ci
npx tsc --noEmit
npm test
npx expo export --platform ios
npx expo export --platform android
```

There is no mobile `typecheck` or `export` script. Those two lines are the TypeScript and Expo CLIs already installed there. `npm run build:android` and `npm run submit:android` call `eas build` / `eas submit`.

Start the local stack with `.cursor/skills/verify/SKILL.md`. Do not use `pnpm dev:stack`: `scripts/dev.sh` runs `pnpm db:up` and can copy the Postgres `DATABASE_URL` from `.env.example`.

## Invariants

- Money stays exact decimal text (`api/src/modules/invoices/money.ts`). Do not persist binary floats. Mobile `formatMoney` (`mobile/src/utils/money.ts`) is en-NZ display only.
- Dates that mean a calendar day are `YYYY-MM-DD`, built from local year, month, and day (`formatDate` in `src/utils/invoiceUtils.ts`, `dateOnly` in `src/features/tax/gstPeriod.ts`). Do not display those fields with `new Date('YYYY-MM-DD')`; that shifts the day west of UTC.
- Invoice preview HTML escapes `& < > " '` before it is interpolated (`escapeHtml` in `mobile/src/utils/invoiceTemplates.ts`). Web email HTML escapes bank account name and number (`escapeBankValue` in `src/services/invoiceTemplateRenderer.tsx`). React preview templates escape text through React.
- Mobile color comes from `useTheme()` (`mobile/src/theme`). Dark canvas is `#121511`, lime is `#9FE870`, and forest `#163300` is the ink on lime (`accentForeground`). Do not put white text on lime.
- Touch targets are at least 44pt (`control.touchTarget` in `mobile/src/theme/tokens.ts`; 48 on Android).
- Screen params live in `mobile/src/navigation/types.ts`. Navigators are typed with `RootStackParamList` and the nested stack lists.

## Do

- Open draft PRs only. Prove the change with the commands above and, for UI, before/after screenshots from the verify skill.
- Read `user_id` and `organisation_id` from the session, never from the request body.
- Keep a UI redesign, a TanStack Router move, an `apps/` move, and a data cutover in separate changes.

## Don't

- Merge, deploy, or run `pnpm deploy:cloudflare`, `eas build`, `npm run build:android`, or `npm run submit:android` unless that exact action was approved.
- Commit secrets, `.env`, `deploy/secrets.local.json`, or personal screenshots. Never rotate the signing secret implicitly.
- Change the EAS project id, slug, or `@jeevan90/easybizinvoice-mobile` binding.
- Replay `supabase/migrations` or `migrations/*.sql`, or start Postgres for this API.
- Authorize product data with both Better Auth and a Supabase session, or add `VITE_OPENAI_*`.
