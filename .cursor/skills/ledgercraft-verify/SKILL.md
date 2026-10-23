---
name: ledgercraft-verify
description: Verify a LedgerCraft change locally with the same commands as CI before opening or updating a pull request. Use for verify, verify before PR, CI parity, smoke, healthz, risk labels, auto-merge, or evidence. Paste real command output.
---

# Verify before a pull request

A change is not verified because it compiles, because a unit test once passed, or because you remember a green run. CI runs every job below on every pull request (no path filter). Run them locally, in this order, and paste the command, the Node version, the exit code, and the summary line into the pull request.

`pnpm verify:w1` through `pnpm verify:w13` (there is no `verify:w10`) run only the API & contracts job. `pnpm db:up` starts Docker Postgres, which CI does not use. API tests use a temporary SQLite file (`api/src/test/setup-env.ts`). Do not claim CI parity from either command.

Write the bug-fix test first (`ledgercraft-tdd`). Check domain rules (`ledgercraft-invariants`). Browser and PDF evidence is `ledgercraft-verify-ui`. An independent pass is `ledgercraft-reviewer`. The author does not apply `review-passed` or `auto-merge-eligible`.

## Node

Web lint, web typecheck, web unit tests, web build, and release readiness use Node 22. API & contracts uses Node 24. Mobile uses Node 20. pnpm is `11.19.0` from `package.json` `packageManager`. Paste `node -v` with each result. When it is not that major, re-run the block under it (`nvm exec 22 -- pnpm lint` and the same for 24 and 20). Do not claim the job matched CI on the wrong major.

Mobile is not in the pnpm workspace. Its install is `npm ci` in `mobile/`, using `mobile/package-lock.json`.

Web and API install:

```bash
pnpm install --frozen-lockfile
```

Reinstall after switching to Node 24 before the API job.

## Commands

Paste each result. `not run` is allowed only with the reason. `pass` without a log is a fail.

### 1. Web lint (Node 22)

Job **Web lint**. `pnpm lint` is `eslint .`. The lint step is allowed to exit non-zero. The job fails only when the error count is above **468**. Warnings are printed and are not a failure on `main`. Do not raise 468.

```bash
pnpm lint > /tmp/web-lint.txt 2>&1; echo "lint_exit:$?"
node .github/scripts/ci-baseline-gate.mjs eslint /tmp/web-lint.txt 468; echo "gate_exit:$?"
```

Pass: a line `eslint: <n> errors, <m> warnings (baseline 468)` and `gate_exit:0`, with `<n>` ≤ 468. Over the ceiling prints `::error::` and `gate_exit:1`.

### 2. Web typecheck (Node 22)

Job **Web typecheck**. Do not use `pnpm type-check` as the gate. That script exits non-zero while this ceiling still passes. Count `error TS` lines. The ceiling is **728**. `tsconfig.node.json` is expected to add no errors. Do not raise 728, and do not delete errors to get under it.

```bash
: > /tmp/web-tsc.txt
pnpm exec tsc --noEmit -p tsconfig.app.json --pretty false >> /tmp/web-tsc.txt 2>&1; echo "app_exit:$?"
pnpm exec tsc --noEmit -p tsconfig.node.json --pretty false >> /tmp/web-tsc.txt 2>&1; echo "node_exit:$?"
node .github/scripts/ci-baseline-gate.mjs tsc /tmp/web-tsc.txt 728; echo "gate_exit:$?"
```

Pass: `tsc: <n> TypeScript errors (baseline 728)` and `gate_exit:0`, with `<n>` ≤ 728.

### 3. Web unit tests (Node 22)

Job **Web unit tests**. Exit 0.

```bash
pnpm test:run
```

Pass: the Vitest summary line and exit 0. A failed test fails the job. There is no baseline.

### 4. Web build (Node 22)

Job **Web build**. Exit 0.

```bash
pnpm build
```

Pass: Vite finishes and `scripts/verify-build-version.mjs` exits 0 (`prebuild` / `postbuild`).

### 5. API & contracts (Node 24)

Job **API & contracts**. Exit 0. This is the whole of `pnpm verify:w1`.

```bash
pnpm install --frozen-lockfile
pnpm test:api && pnpm test:contracts && pnpm type-check:api
```

Pass: API Vitest, contracts Vitest, and both typechecks exit 0. `node -v` in that shell must be v24.

### 6. Release readiness (Node 22)

Job **Release readiness script**. No `pnpm install`. Exit 0 on both. These are the two steps in `.github/workflows/ci.yml`.

```bash
node --test .github/scripts/verify-api-readiness.test.mjs scripts/upload-api-sourcemaps.test.mjs
node --test scripts/upload-web-sourcemaps.test.mjs
```

Pass: each run ends with `# fail 0`.

### 7. Mobile (Node 20)

Job **Mobile**. All four steps fail the job on a non-zero exit. ESLint warnings may print; errors fail `npm run lint`. There is no count gate. `node -v` must be v20.

```bash
cd mobile
npm ci
npm run lint
npx tsc --noEmit --pretty false
npm test -- --ci --watchAll=false
EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true \
  npx expo export --platform ios --output-dir /tmp/expo-ios
```

Pass: lint, `tsc`, and Jest exit 0, and the export writes `/tmp/expo-ios`. Android export is not a CI job.

## After the push

CI jobs run in parallel. Do not end the run while any of them is pending. `gh pr checks` until none are queued or in progress.

If a job fails immediately and the annotation says the job was not started because recent account payments have failed, or a spending limit needs to be increased, paste that annotation and stop. Do not edit a workflow, rerun in a loop, or change tests to get past it.

Draft [PR #63](https://github.com/jeevan-vj/ledger-craft-app/pull/63) proposes `.github/lint-baseline.json` and warning ceilings. Until that is on `main`, the ceilings are 468 and 728 in `.github/workflows/ci.yml`. [PR #15](https://github.com/jeevan-vj/ledger-craft-app/pull/15) adds `Verification evidence (experimental)`, which is not on `main`. Do not require a check named `verify`, and do not copy that workflow.

`SonarCloud Code Analysis` is not a job in `.github/workflows/ci.yml`. A cancelled Sonar check does not by itself fail this list.

## Live HTTP

For a behaviour change, after the commands above:

```bash
pnpm dev:api    # 127.0.0.1:3001
pnpm dev        # Vite :8080
curl -sS localhost:3001/api/healthz
curl -sS localhost:8080/api/healthz
curl -sS localhost:8080/api/me
```

Health is `{ "status": "ok" }`. Unauthenticated `/api/me` is 401 `{ error: { code, message, requestId } }`. This does not replace the CI commands.

## Risk label

`docs/PIPELINE.md` is the contract. Highest matching rule wins. Explain the choice in the pull request. Apply labels when the token can write them; if it cannot, list them in the body as not applied.

| Label | When |
| --- | --- |
| `risk:high` | Any path in the high-risk list below, a secret, or a major dependency bump |
| `risk:medium` | Product behaviour that matches none of the high-risk list |
| `risk:low` | Docs, copy, or a local change that matches none of the high-risk list |

High-risk paths (also requested in `.github/CODEOWNERS`):

- Migrations and Drizzle: `api/sqlite-migrations/`, `api/src/db/schema/`, `api/src/db/migrate.ts`, `api/drizzle.config.ts`, `api/drizzle.sqlite.config.ts`, `scripts/generate-sqlite-migrations.mjs`
- Money, GST, invoice, or quote totals. Invoice and quote totals both use `computeInvoiceTotals` (`api/src/modules/invoices/totals.ts`; quotes call it from `api/src/modules/quotes/quotes.service.ts`). Rounding is `roundMoney` in `api/src/modules/invoices/money.ts`. Bill lines use `calculateBillLines` in `api/src/modules/purchases/purchases.repository.ts`. Inline client totals listed in CODEOWNERS count too.
- Auth: `api/src/modules/auth/`, `api/src/app.ts`, `api/src/index.ts`, `api/src/cloudflare/worker.ts`, `api/src/env.ts`
- Workflows and release: `.github/workflows/`, `wrangler.toml`, `deploy/api/wrangler.jsonc`, `deploy/cloudflare.md`, `functions/api/`, `mobile/eas.json`, `scripts/deploy-cloudflare.mjs`, and the other release scripts named in CODEOWNERS

Also apply one `type:*`, the `area:*` values that fit, one `priority:*`, and one `size:*`. Set `agent:review` when the pull request is ready. Do not set `review-passed` or `auto-merge-eligible` on your own pull request.

`auto-merge-eligible` may be applied only by the reviewer skill, and only when all of these hold. The GitHub merge gate is not implemented.

- `risk:low`, and no changed file matches a CODEOWNERS path
- every CI job in this skill is green
- `review-passed` was applied by a different agent session
- no unresolved review threads
- under 300 changed lines and 15 changed files (`git diff --numstat origin/main`)

`risk:medium` and `risk:high` stay `needs-human`. A person merges them.

## Evidence

Put this in the pull request, filled with real output:

```markdown
## Verification evidence

| Job | Node | Result |
| --- | --- | --- |
| Web lint (`pnpm lint` + gate 468) | | |
| Web typecheck (gate 728) | | |
| Web unit tests (`pnpm test:run`) | | |
| Web build (`pnpm build`) | | |
| API & contracts | | |
| Release readiness (two `node --test` commands) | | |
| Mobile lint / tsc / Jest / iOS export | | |

### Screenshots
UI changes: phone 390×844, and 1440×900 when layout changed. Embed the images.

### Risk
- Label: `risk:` because …
- CODEOWNERS paths: none, or the list
- Diff: <files> files, <added>+<deleted> lines
- `auto-merge-eligible`: no, until a different reviewer applies it

### Rollback
`git revert` of this pull request. Migrations have no down script; name the SQL file and say production objects keep it.

### After merge
Human steps, or none. Release to Cloudflare runs only after CI succeeds on `main`.
```

## Do not

- Weaken, skip, or delete a test to get a green run
- Raise 468, 728, or any later baseline file to absorb a new diagnostic
- Wrap the failing call in a broad `try/catch` that hides the error
- Edit a snapshot, fixture, or golden file so the assertion passes
- Touch files that the change does not need
- End the run while CI is still pending
- Treat Docker Postgres, `pnpm verify:w13`, or the experimental workflow on PR #15 as CI
