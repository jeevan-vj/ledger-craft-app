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
  - [ ] Money, GST, invoice, or quote calculation (invoice and quote totals use `computeInvoiceTotals` in `api/src/modules/invoices/totals.ts`; quotes call it from `api/src/modules/quotes/quotes.service.ts`; rounding is `roundMoney` in `api/src/modules/invoices/money.ts`; bill lines use `calculateBillLines` in `api/src/modules/purchases/purchases.repository.ts`)
  - [ ] Auth: Better Auth config or routes (`api/src/modules/auth/`, the `/api/auth/*` mount in `api/src/app.ts`, the Identity handler in `api/src/cloudflare/worker.ts`, `api/src/env.ts`)
  - [ ] `.github/workflows/` or release config (Wrangler, `scripts/deploy-cloudflare.mjs`, Pages `functions/api/`, `mobile/eas.json`, `deploy/cloudflare.md`)
  - [ ] Secrets
  - [ ] Major dependency bumps

`auto-merge-eligible` is only for a pull request that is `risk:low` after an independent review. The merge gate is not in this repository yet.

## Screenshots

UI changes: paste before and after images here. Agent-written UI changes also include a phone-width (390×844) screenshot.

## Agent evidence

Authors fill this from `.cursor/skills/ledgercraft-verify/SKILL.md`. A checked box without command output is not evidence. The author does not mark `review-passed`.

| Job | Node | Result |
| --- | --- | --- |
| Web lint (`pnpm lint` + gate 468) | | |
| Web typecheck (gate 728) | | |
| Web unit tests (`pnpm test:run`) | | |
| Web build (`pnpm build`) | | |
| API & contracts (Node 24) | | |
| Release readiness (two `node --test` commands) | | |
| Mobile lint / tsc / Jest / iOS export (Node 20) | | |

- Risk label and why:
- CODEOWNERS paths:
- Diff size (files, added+deleted lines):
- Rollback:
- After merge:
