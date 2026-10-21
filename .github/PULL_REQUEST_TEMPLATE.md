Closes #N

## Summary

## Test plan

- [ ]

## Risk self-assessment

Tick one level. Tick every high-risk item this pull request touches. `risk:high` applies when any item in that list is checked.

- [ ] `risk:low` — docs, copy, or a local change outside the high-risk list
- [ ] `risk:medium` — product behaviour outside the high-risk list
- [ ] `risk:high` — one or more of these:
  - [ ] Migrations under `api/sqlite-migrations/`, or Drizzle schema and config (`api/src/db/schema/`, `api/src/db/migrate.ts`, `api/drizzle.config.ts`, `api/drizzle.sqlite.config.ts`, `scripts/generate-sqlite-migrations.mjs`)
  - [ ] Money, GST, invoice, or quote calculation (there is no quote module; invoice totals live in `api/src/modules/invoices/totals.ts` and `api/src/modules/invoices/money.ts`, bill lines in `calculateBillLines` in `api/src/modules/purchases/purchases.repository.ts`)
  - [ ] Auth: Better Auth config or routes (`api/src/modules/auth/`, the `/api/auth/*` mount in `api/src/app.ts`, the Identity handler in `api/src/cloudflare/worker.ts`, `api/src/env.ts`)
  - [ ] `.github/workflows/` or release config (Wrangler, `scripts/deploy-cloudflare.mjs`, Pages `functions/api/`, `mobile/eas.json`, `deploy/cloudflare.md`)
  - [ ] Secrets
  - [ ] Major dependency bumps

`auto-merge-eligible` is only for a pull request that is `risk:low` after an independent review. The merge gate is not in this repository yet.

## Screenshots

UI changes: paste before and after images here.
