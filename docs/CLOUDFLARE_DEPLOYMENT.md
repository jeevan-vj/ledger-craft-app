# Cloudflare deployment

Use [the current deployment runbook](../deploy/cloudflare.md).

The approved `mobile-app` deployment is Cloudflare-only on the free plan:
Pages, a Hono Worker, Better Auth in an Identity SQLite Durable Object, and one
Ledger SQLite Durable Object per organisation. It uses no D1, Containers,
PostgreSQL, R2, Supabase or external email/AI service. Repeat deployments use
`pnpm deploy:cloudflare`; local release validation uses `pnpm deploy:check`.
The website and SQLite API are deployed and verified at
https://ledger-craft-app.pages.dev. Build `9c9be2c59d54`, Worker
`ed6c6bb9-9f09-41a1-a651-a97067197fa3`. All 116 contract/API tests, live
functional smoke checks and Chrome login/navigation checks passed. See the
runbook for limitations, recovery guidance and exact verification scope.

The initial Pages direct upload on 2026-09-11 used the old `main` branch
(deployment `ce26ed2c-91b4-4504-88a1-548241fa9662`, build `9c6bcfea901e`).
That frontend used Supabase and does not verify the current branch or backend.
