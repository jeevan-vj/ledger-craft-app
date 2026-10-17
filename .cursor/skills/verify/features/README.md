# LedgerCraft verification map

This directory is the maintained source for user-facing checks. Read it before driving the app, then use the matching feature file.

## Baseline preconditions

- Node 24 or newer. `node -v` must not be v22.
- Launch from `.cursor/skills/verify/SKILL.md` with a new `DATABASE_URL` `file:` path under `/tmp/ledgercraft-verify-data-$RUN_ID`.
- Apply migrations with `pnpm db:migrate` before signup. `/api/healthz` can pass on an empty file.
- Doctor must show API `127.0.0.1:3001` and Vite `http://127.0.0.1:8080`, both owned by this run.
- There is no seed user. The sign-up feature creates the only account.
- Do not drive an API or Vite you did not start, and do not start a second pair on these ports.

## Driving conventions

- Open the web app at `http://127.0.0.1:8080`.
- Prefer the accessible name (label, heading, button, link) over coordinates.
- Treat commands in each feature file as literal.
- API checks use `curl` against `127.0.0.1:3001` or a same-origin fetch from the signed-in page.
- Restore nothing into the disposable database. Delete that directory in cleanup. Keep `$EVIDENCE_DIR`.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final screen.
- UI proof is a screenshot before the action and a screenshot after it, with the heading visible.
- Session proof is `GET /api/me` from the same browser, plus the email stored in the run's SQLite file.
- Record the feature id with every artifact.
- An unreachable path stays failed. Name the command you ran and the missing precondition. Do not mark it verified through a different surface.

## Feature entry contract

Each feature file has an H1, one paragraph, then these H2 sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with the browser`, `Gotchas`.

## Features

- [Create an account](./sign-up.md) covers `/signup`, the session, and Home.
- [Invoices](./invoices.md) covers the empty invoice list after that account exists.
- [Customers](./customers.md) covers the empty customer list after that account exists.
- [Mobile sign-in](./mobile-sign-in.md) covers the Expo login screen. Device UI is unverified in this environment.
