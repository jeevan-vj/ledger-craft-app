---
name: verify
description: Proves a LedgerCraft change on the Vite web app, Hono API, and Expo mobile app. Use when verifying a change, smoke-testing signup or product screens, or attaching evidence before a draft PR.
---

# Verify LedgerCraft

Drive the real app and keep the proof. Read `features/README.md` before a UI run, then follow the feature file. One convenient entry point does not cover the other entries in that map.

This environment has one web port pair. Do not start a second API or Vite against 3001 or 8080.

## Launch

The API needs Node 24 or newer. `api/src/db/local.ts` calls `statement.columns()` and `statement.setReturnArrays()`. Node 22 does not provide them (`statement.setReturnArrays is not a function`). Confirm with `node -v` before migrating.

There is no seed script and no demo user. A fresh SQLite file plus Better Auth signup is the empty-to-usable path. Do not copy `.env.example` into `.env` for this run: its `DATABASE_URL` is Postgres, and `createDb` throws `Local database must be a SQLite filename or file URL`. Do not run `pnpm dev:stack` or `scripts/dev.sh`; those start Docker Postgres.

```bash
export RUN_ID="verify-$(date +%s)"
export DATA_DIR="/tmp/ledgercraft-verify-data-$RUN_ID"
export EVIDENCE_DIR="/tmp/ledgercraft-verify-evidence-$RUN_ID"
mkdir -p "$DATA_DIR" "$EVIDENCE_DIR"
export DATABASE_URL="file:$DATA_DIR/ledgercraft.sqlite"
export DATABASE_MIGRATE_URL="$DATABASE_URL"
unset DATABASE_ADMIN_URL
pnpm db:migrate
```

Ready for migrate: stdout contains `SQLite migrations applied`. Leave `BETTER_AUTH_SECRET` unset outside production. `api/src/env.ts` then uses its dev fallback. `BETTER_AUTH_URL` defaults to `http://localhost:8080`.

Record the pids you start. In two terminals, from the repo root, with the same `DATABASE_URL`:

```bash
pnpm dev:api
pnpm dev
```

The API is ready when its log contains `"msg":"api_listen"` with `"port":3001` and doctor health checks pass. Vite is ready when it prints `Local:` with `http://localhost:8080/`. A health check that passes before `pnpm db:migrate` is not a usable app: signup will fail on missing tables. `GET /api/readyz` only checks `SELECT 1`, so run migrate and then doctor.

## Doctor

Run this before driving, and again when a page looks wrong.

```bash
node -v
curl -sS http://127.0.0.1:3001/api/healthz
curl -sS http://127.0.0.1:3001/api/readyz
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/me
curl -sS http://127.0.0.1:8080/api/healthz
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

Worth driving only when all of these hold:

- `node -v` is v24 or newer
- both health URLs return `{"status":"ok"}`
- `readyz` returns `{"status":"ok"}`
- unauthenticated `/api/me` returns `401`
- ports 3001 and 8080 are the `pnpm dev:api` and `pnpm dev` processes from this run

`401` body shape is `{ "error": { "code": "UNAUTHORIZED", "message", "requestId" } }`.

## Drive

Prefer the browser on `http://127.0.0.1:8080`. Stable handles are the visible labels and headings below, plus `data-testid` where a feature file names one. Use curl for health and for `/api/me` outside a browser session. Playwright (`pnpm test:e2e`) is not this harness: `playwright.config.ts` starts `npm run dev` only, so the API is absent, and the root README still describes Supabase on port 8081.

Signup is the way to get a session. Google buttons are not a path: `signInWithGoogle` returns `Google sign-in is not available yet. Use email and password.`

Password rule on `/signup`: at least 8 characters with an uppercase letter, a lowercase letter, and a digit. The `Create account` button stays disabled until the form is valid, including the terms checkbox.

After `Create account`, the app sets the session and navigates to `/onboarding`. `signUp` marks onboarding complete, so `ProtectedRoute` sends that URL to `/`. The proof is the Home heading plus `GET /api/me` from that same browser session (`user.email`, `membership.role` `owner`). A toast is not proof.

## Evidence

Save proof under `$EVIDENCE_DIR`. Do not commit it. Personal screenshots do not belong in git.

For a UI proof, capture the action and the resulting state:

- screenshot of the screen before the submit
- screenshot after the app lands on the next screen
- the `GET /api/me` JSON from that browser session
- for a write, a second read of the disposable SQLite file (the email row), not only the page

Command proof is the command, stdout, stderr, and exit code. Name the feature id from the map on every artifact.

Mocks: API tests inject mailer, object storage, and OpenAI only where production already treats those as boundaries. A local signup proof must hit the real Hono process and the SQLite file. Do not point the browser at hosted production.

## Cleanup

Stop the API and Vite pids recorded at launch. Do not kill by process name. Then:

```bash
rm -rf "$DATA_DIR"
```

Leave `$EVIDENCE_DIR` in place. Cleanup that deletes the proof has failed.

## Helpers

No helper script ships with this skill. The commands above are the harness.

## Mobile

`mobile/` is a separate npm tree. From `mobile/`:

```bash
npm ci
npx tsc --noEmit
npm test
npx expo export --platform ios
npx expo export --platform android
```

`tsc` and `expo export` are CLIs of the installed `typescript` and `expo` packages. There is no npm script with those names. `expo export` writes a static bundle (default directory `dist/`, which is gitignored). It does not install a simulator build and it is not `eas build`.

Device and simulator screens are a known gap here: this checkout has no iOS simulator and no Android emulator. A green export does not prove a screen. Say that in the report instead of calling the device path verified.

## Command results

Checked 2026-10-17 on this repo. Re-run before trusting the numbers.

| Command | Result |
| --- | --- |
| `pnpm install` (pnpm 11.19.0) | pass |
| `pnpm lint` | fail, pre-existing: 564 problems (452 errors, 112 warnings) |
| `pnpm type-check` | pass |
| `pnpm type-check:api` | pass |
| `pnpm test:contracts` | pass |
| `pnpm test:run` | pass, 64 files, 507 tests |
| `pnpm test:api` on Node 24 | pass, 29 files, 77 tests |
| `pnpm test:api` on Node 22 | fail, `statement.columns` / `setReturnArrays` missing |
| `pnpm build` | pass |
| `npm ci` in `mobile/` | pass |
| `npx tsc --noEmit` in `mobile/` | fail, exit 2, pre-existing type errors |
| `npm test` in `mobile/` | fail, 13 suites passed, 2 failed (12 tests) |
| `npx expo export --platform ios` | pass (output dir can be overridden; default is `dist/`) |
| `npx expo export --platform android` | pass |

The two failing mobile suites are `src/services/__tests__/itemService.test.ts` and `src/services/__tests__/businessProfileService.test.ts`. They still call Supabase `getUser` and throw `User not authenticated`. There is no signed-in fixture for them.

## Known gaps

- No seed data, no demo organisation, and no checked-in user. Empty Home, Invoices, and Customers are the first-run state.
- Authenticated mobile screens need a device or simulator. Export and Jest do not replace that.
- `pnpm lint` and mobile `tsc` are red on the current tree. A change is not what made them red unless the diff touches those lines.
- Web email HTML (`createEmailCompatibleInvoiceHtml`) escapes bank details and leaves other interpolated strings unescaped. Mobile preview HTML goes through `escapeHtml`. Do not treat those as the same helper.

## Maintenance

When a route, label, or command in `features/` drifts, update that file in the same change. The maintenance entry point is `/maintain-verification-skill`.
