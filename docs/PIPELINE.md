# Software factory pipeline

Label names, risk rules, and the review loop for EasyBizInvoice. `TARGET_ARCHITECTURE.md` stays the architecture spec. This file is the intake and merge contract. The Review loop section below is the only copy of those steps. `ledgercraft-reviewer`, `ledgercraft-verify`, and `AGENTS.md` link here.

An auto-merge gate is not implemented. When it is, it auto-merges only a pull request labeled `auto-merge-eligible`. That label is allowed only when every condition in stage 6 holds. `review-passed` plus `risk:low` is not enough.

## Labels

`.github/labels.yml` is the source. `.github/workflows/labels.yml` creates and updates those labels on a push to `main` that changes the label file or the workflow, and when someone runs the workflow with `workflow_dispatch`. The sync sets `skip-delete`, so a label that is not in the file stays on the repository. Default GitHub labels such as `bug` and `enhancement` are left alone.

GitHub allows 100 characters in a label description. The `risk:high` label carries a short form of the rule. The full rule is below.

| Group | Labels |
| --- | --- |
| Type | `type:bug`, `type:feature`, `type:chore`, `type:docs`, `type:refactor` |
| Area | `area:web`, `area:api`, `area:mobile`, `area:contracts`, `area:ci`, `area:infra` |
| Priority | `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3` |
| Size | `size:xs`, `size:s`, `size:m`, `size:l`, `size:xl` |
| Risk | `risk:low`, `risk:medium`, `risk:high` |
| State | `spec-ready`, `agent:building`, `agent:review`, `review-passed`, `needs-human`, `auto-merge-eligible` |

Use one label from each group that applies. Priority `p0` is a production break or data risk. Size `xl` should be split before an agent builds it.

## Stages

These labels describe the handoff. Nothing in this repository moves them automatically yet.

1. Open a feature/spec or bug issue from `.github/ISSUE_TEMPLATE/`. The forms ask for the problem or repro, and the spec form asks for an acceptance checklist, a test plan, likely files, and a risk.
2. `spec-ready` means an agent can implement the checklist without guessing.
3. `agent:building` replaces `spec-ready` while an agent is implementing.
4. `agent:review` means the implementation is up for an independent review.
5. `review-passed` means that review passed. `needs-human` means a person has to decide before the work continues.
6. `auto-merge-eligible` requires every condition below. Missing any one of them means the label stays off.

   - `risk:low`, meaning none of the high-risk paths in the next section
   - `review-passed` applied by a different agent than the author
   - every job in `.github/workflows/ci.yml` is green
   - no unresolved review threads
   - line count under 300 and file count under 15. Run `git diff --numstat origin/main...HEAD` (three dots, not two). Sum both numeric columns on every row for the line count. The number of rows is the file count. A row `409 165 path` contributes 574, not 409.
   - no changed file matches a path in `.github/CODEOWNERS`

`risk:medium` and `risk:high` stay on `needs-human`. A person merges them. Nothing in this repository applies the label or merges on its own.

## Review loop

This section is the only copy of the review loop. Skills and `AGENTS.md` link here.

1. The builder runs a self-review against `ledgercraft-reviewer` before opening the pull request, opens it with the full evidence table from `ledgercraft-verify`, and waits until every job in `.github/workflows/ci.yml` is green.
2. An independent reviewer agent, in a different session from the builder, reviews and posts one verdict comment. The comment shape is in `ledgercraft-reviewer`: **PASS** or **CHANGES REQUESTED**, with blockers, should-fixes, and nits. A PASS that recommends merge is valid only after that skill's head-commit check.
3. Review fixes are made by the same builder agent and environment that implemented the pull request, not a new agent. The builder fixes every blocker and should-fix, plus cheap in-scope nits, pushes, replies on each thread, and waits until CI is green again.
4. The builder escalates to the human instead of fixing anything that changes scope, money or GST logic, migrations, auth, or a previously approved product decision. Use `needs-human` when the token can write labels.
5. On a revision, the reviewer re-reviews only the delta since its last reviewed commit. The verdict comment names that commit range. The reviewer does not review the whole pull request again.
6. Cap: at most 2 delta re-review rounds after the first review. If the pull request is still not PASS, stop and escalate to the human with the open items. Do not start a third delta round.
7. A person merges `risk:medium` and `risk:high`. Only `risk:low` that meets every condition in stage 6 may be labeled `auto-merge-eligible`. The auto-merge gate is not implemented. The author does not apply `review-passed` or `auto-merge-eligible`.

## Risk rules

Tick one risk on the pull request. The highest matching rule wins.

`risk:low` is docs, copy, or a local change that matches none of the high-risk items.

`risk:medium` is a product behaviour change that matches none of the high-risk items.

`risk:high` is any pull request that touches one or more of these. This section is the only path list. `.cursor/skills/ledgercraft-verify/SKILL.md`, `AGENTS.md`, and `.github/PULL_REQUEST_TEMPLATE.md` point here. They do not keep a second list.

- Migrations or Drizzle: `api/sqlite-migrations/`, `api/src/db/schema/`, `api/src/db/migrate.ts`, `api/drizzle.config.ts`, `api/drizzle.sqlite.config.ts`, `scripts/generate-sqlite-migrations.mjs`.
- Money, GST, invoice, or quote calculation. Invoice and quote totals both go through `computeInvoiceTotals` in `api/src/modules/invoices/totals.ts` (quotes call it from `api/src/modules/quotes/quotes.service.ts`). Decimal rounding is `roundMoney` in `api/src/modules/invoices/money.ts`. Bill line GST is `calculateBillLines` in `api/src/modules/purchases/purchases.repository.ts`. Web and mobile screens that still compute a total or GST amount inline are listed in `.github/CODEOWNERS`. That file does not yet name the quote service; a quote-totals diff is still `risk:high`.
- Auth: `api/src/modules/auth/`, `api/src/app.ts`, `api/src/index.ts`, `api/src/cloudflare/worker.ts`, `api/src/env.ts`. `api/src/index.ts` is where the Node server constructs Better Auth.
- Workflows, release, and the baseline gate: `.github/workflows/`, `wrangler.toml`, `deploy/api/wrangler.jsonc`, `deploy/cloudflare.md`, `functions/api/`, `mobile/eas.json`, `scripts/deploy-cloudflare.mjs`, `scripts/verify-cloudflare.mjs`, `scripts/upload-api-sourcemaps.mjs`, `scripts/upload-api-sourcemaps.test.mjs`, `scripts/upload-web-sourcemaps.mjs`, `scripts/upload-web-sourcemaps.test.mjs`, `scripts/delete-sourcemaps.mjs`, `scripts/auto-version.js`, `scripts/generate-version.js`, `scripts/verify-build-version.mjs`, `.github/scripts/verify-api-readiness.mjs`, `.github/scripts/verify-api-readiness.test.mjs`, `.github/scripts/ci-baseline-gate.mjs`, the lint and typecheck ceilings in `.github/workflows/ci.yml`, and any baseline file such as `.github/lint-baseline.json`.
- Verification policy, so a small docs edit cannot loosen auto-merge: `.cursor/skills/ledgercraft-verify/SKILL.md`, `.cursor/skills/ledgercraft-reviewer/SKILL.md`, `.cursor/skills/ledgercraft-invariants/SKILL.md`, `docs/PIPELINE.md`, `.github/PULL_REQUEST_TEMPLATE.md`.
- Secrets.
- A major dependency bump.

## Review owners

`.github/CODEOWNERS` requests `@jeevan-vj` on the migration, money and GST, Better Auth, workflow, and release paths above. It does not yet list the verification-policy files or `.github/scripts/ci-baseline-gate.mjs`. Those paths are still `risk:high`. The file lists each owned path. A few owned files mix that logic with other edits, because CODEOWNERS matches files:

- `api/src/modules/purchases/purchases.repository.ts` holds `calculateBillLines` and vendor persistence.
- `src/components/invoice/InvoiceForm.tsx` inlines invoice GST next to the rest of the form.
- `api/src/app.ts`, `api/src/index.ts`, and `api/src/cloudflare/worker.ts` construct or mount Better Auth and also compose the rest of the API.
- `api/src/env.ts` reads the Better Auth secret and also the database URL.

Preview templates that fall back to `quantity * rate` for display are not calculation owners. Stored invoice totals stay on `computeInvoiceTotals`.
