# Local feature acceptance

Business users should be able to create and retrieve documents, collect and pay money once, correct mistakes without losing history, reconcile their bank, and export reports they can explain. Accountants should expect exact balanced postings, auditable source/settlement identity, historical cutoffs, and reproducible tax worksheets. Product experts should require permission boundaries, honest unavailable-provider states, reliable retry handling, and usable desktop/phone workflows.

The feature catalogue in [feature-verification.json](feature-verification.json) maps each current domain to a reusable skill, concrete business flow, accounting oracle and real integration tests. These are acceptance criteria, not claims of completed verification. Optional gaps in `akaunting-core-capabilities.json` stay open. Issue #114 remains parked.

## Execution contract

1. Fetch the authoritative main, record base/head SHA and dirty state, preserve existing work. Use this dedicated worktree and an isolated local SQLite database. Never use customer/production data as a fixture.
2. Install the pinned workspace dependencies; mobile uses its own npm lockfile. Follow `ledgercraft-verify` for CI major versions and commands. Keep command logs and nonzero exits.
3. Run the selected domain integration suite. For the month-close oracle, use the independent Decimal paper in `docs/evidence/full-month-close/`, then the full-month-close integration test. Do not derive expected results from the implementation under test.
4. Start local API and web, sign up a synthetic user, complete onboarding and execute each skill's flow through the visible UI. Use the shared preview browser when available. API-only operations are explicitly labelled; they cannot substitute for UI acceptance. Capture success after reload, relevant validation failures and exported files.
5. Repeat applicable Expo flows. Expo web is not installed-device proof. Camera, native share, back, keyboard, safe-area, offline/background and install/upgrade checks require named platform evidence.
6. Record each result in a run ledger: feature, layer, status, expected, actual, command/steps, source SHA, UTC timestamp, screenshot/export paths, issue link and limitations. `PASS` requires actual execution; historical evidence, page-load smoke and a mocked provider have separate labels.
7. Search GitHub for duplicates, then log confirmed defects with reproduction, expected/actual, impact, evidence and acceptance criteria. Fix with a failing regression first, rerun it and affected integration/UI flows. Keep issues open until their acceptance and delivery boundary are satisfied.

## Screenshots and confirmation

Use fresh captures in a timestamped run directory, with no real customer information, auth cookies or secret/share tokens. Pair every screenshot with the action it proves and an independent persistence/assertion result. Capture web at 1440x900 and 390x844; label Expo web separately. Show requested screenshots inline and provide the complete evidence index. A route smoke image proves rendering only.

Tax tests assert the product's documented supported NZ scenario, not professional certification, eligibility advice or IRD submission. Live email, Stripe, Akahu, AI and store/device acceptance require their own explicit evidence and configured credentials. Never substitute fixture success for live-provider confirmation.

## Feature skills

- [Account access and recovery](../.cursor/skills/ledgercraft-check-identity/SKILL.md)
- [Companies and permissions](../.cursor/skills/ledgercraft-check-companies/SKILL.md)
- [Business settings and branding](../.cursor/skills/ledgercraft-check-profile/SKILL.md)
- [Customers and collections](../.cursor/skills/ledgercraft-check-customers/SKILL.md)
- [Products and services](../.cursor/skills/ledgercraft-check-catalogue/SKILL.md)
- [Quotes and estimates](../.cursor/skills/ledgercraft-check-quotes/SKILL.md)
- [Invoice lifecycle](../.cursor/skills/ledgercraft-check-invoices/SKILL.md)
- [Payments and receipts](../.cursor/skills/ledgercraft-check-payments/SKILL.md)
- [Customer credits and refunds](../.cursor/skills/ledgercraft-check-credit-notes/SKILL.md)
- [Vendors and bills](../.cursor/skills/ledgercraft-check-purchases/SKILL.md)
- [Expenses and receipt capture](../.cursor/skills/ledgercraft-check-expenses/SKILL.md)
- [Bank accounts and transactions](../.cursor/skills/ledgercraft-check-banking/SKILL.md)
- [Bank reconciliation](../.cursor/skills/ledgercraft-check-reconciliation/SKILL.md)
- [Chart of accounts and journals](../.cursor/skills/ledgercraft-check-journals/SKILL.md)
- [Financial reports and dashboards](../.cursor/skills/ledgercraft-check-reports/SKILL.md)
- [GST settings and returns](../.cursor/skills/ledgercraft-check-gst/SKILL.md)
- [Currency and reviewed FX](../.cursor/skills/ledgercraft-check-currency/SKILL.md)
- [Recurring documents](../.cursor/skills/ledgercraft-check-recurring/SKILL.md)
- [Statements and reminders](../.cursor/skills/ledgercraft-check-statements/SKILL.md)
- [Invoice and document imports](../.cursor/skills/ledgercraft-check-imports/SKILL.md)
- [Quick sale](../.cursor/skills/ledgercraft-check-quick-sale/SKILL.md)
- [Stripe payment operations](../.cursor/skills/ledgercraft-check-stripe/SKILL.md)
- [Bank feed connections](../.cursor/skills/ledgercraft-check-bank-feeds/SKILL.md)
- [Assistant and scanned documents](../.cursor/skills/ledgercraft-check-assistant/SKILL.md)
- [Dashboard and saved reports](../.cursor/skills/ledgercraft-check-dashboard/SKILL.md)

## Reproduction commands

After the pinned install and local database/server setup:

```sh
pnpm --filter @ledgercraft/api exec vitest run --maxWorkers=1 --reporter=default --reporter=json --outputFile=/tmp/ledgercraft-api-results.json
node scripts/feature-verification-report.mjs /tmp/ledgercraft-api-results.json docs/evidence/feature-verification/<run>
node --test scripts/proof-runtime.test.mjs
CLOSE_OUTPUT=/tmp/fresh-close CLOSE_STAGE=signup node scripts/full-month-close-web-proof.mjs
```

Run the subsequent web stages in order: `invoices`, `receipts`, `purchases`, `credits`, `bank`, `reports`, `gst`, retaining the same `CLOSE_OUTPUT`. `CLOSE_WEB_URL` selects an alternate loopback web server. Browser drivers use the Playwright-installed browser; run `pnpm exec playwright install chromium` if needed, or set `PROOF_BROWSER_PATH` for a preinstalled Linux executable.

The mobile close uses `CLOSE_MOBILE_URL`, `CLOSE_API_URL`, and a separate `CLOSE_OUTPUT`. Its session and records are local to that output directory. Start with `node scripts/full-month-close-mobile-proof.mjs signup`, then `setup`, `invoices`, `bill`, `expense`, `credits`, `bank`, `reports`, `audit`, `exports`, `gst-evidence`. Inspect driver prerequisites before resuming a partially failed stage; do not rerun monetary actions blindly.

Keep raw session/state files outside published evidence. This checkout installs discoverable `~/.codex/skills/ledgercraft-check-*` symlinks pointing at the versioned `.cursor/skills` sources; moving/removing the worktree requires relinking them.

The month-close API test writes fresh evidence beside its isolated test database by default. Set `LEDGERCRAFT_MONTH_CLOSE_EVIDENCE_DIR` to a new directory to retain it explicitly. It refuses to overwrite `results.json`; historical evidence stays unchanged.

The API report accepts additional complete-file rerun JSON paths after the output directory. It retains every attempt and uses the latest assertion statuses. Do not pass a name-filtered partial run as a replacement for a complete file; skipped assertions remain incomplete. Preserve original failure logs.
