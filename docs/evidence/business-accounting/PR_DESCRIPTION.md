## Summary

A newly registered NZ business could record invoices and expenses while GST preparation, bank reconciliation and financial reports disagreed. This change completes the representative business flow across web and Expo and fixes the accounting defects reproduced during verification.

- Add one company-scoped, invoice-basis NZD GST preparation endpoint shared by both clients. Include received supplier bills and approved expenses, preserve historical cancellation/restoration movements, apply partial/private-use GST claims once, and guard unsupported negative-source adjustment periods.
- Correct selected-bank supplier postings, cumulative balance-sheet profit, duplicate postings when matching existing settlements, match/undo idempotency, and statement closing balances. Reject unsafe legacy confirmations and invalid expense payment accounts.
- Restore web account creation/edit/deactivation and posted balances. Complete mobile expense gross/GST editing and approval, vendor creation, onboarding contact persistence, and GST draft save/reload.
- Support custom registered GST periods and confirmed myIR due dates on web. Remove the unsupported automatic company income-tax estimate and misleading compliance claims.

The independent service-company worksheet reconciles to revenue NZ$1,400, expenses NZ$550, profit NZ$850, cash NZ$6,031 including capital, receivables NZ$230, payables NZ$276 and invoice-basis GST NZ$135. Every journal and trial balance balances. The mobile operating case excludes capital and has cash NZ$1,031.

## Test plan and evidence

All results below were collected locally against the implementation before this commit; final packaging only removes trailing blank lines and marks evidence PDFs as binary. No application behavior changed after verification. Full scope, screenshots, PDFs and independent worksheet: [business accounting report](docs/evidence/business-accounting/README.md).

| Job / command | Node | Actual result / exit |
| --- | --- | --- |
| `pnpm lint`; `node .github/scripts/ci-baseline-gate.mjs eslint <log> 468` | 22.23.4 | Raw lint exit 1: `460 errors, 118 warnings`; existing baseline gate exit 0 |
| `pnpm exec tsc --noEmit -p tsconfig.app.json --pretty false`; node-config tsc; baseline gate 728 | 22.23.4 | App exit 2 with 648 errors; node config exit 0; existing baseline gate exit 0. Not a clean web typecheck |
| `pnpm test:run` | 22.23.4 | Exit 0: `Test Files 119 passed`; `Tests 704 passed` |
| `pnpm build` | 22.23.4 | Exit 0 including pre/postbuild: `Verified app version 0.0.8, build ffba132f7715` |
| `pnpm test:api` | 24.22.1 | Exit 0: `Test Files 81 passed`; `Tests 373 passed, 1 skipped` (existing credit-note capability skip) |
| `pnpm test:contracts`; `pnpm type-check:api` | 24.22.1 | Both exit 0: `Test Files 28 passed`; `Tests 127 passed`; API and contracts strict TypeScript clean |
| `node --test .github/scripts/verify-api-readiness.test.mjs scripts/upload-api-sourcemaps.test.mjs scripts/verify-akaunting-core.test.mjs` | 22.23.4 | Exit 0: 3 passed, 0 failed |
| `node --test scripts/upload-web-sourcemaps.test.mjs`; `node scripts/verify-akaunting-core.mjs --report` | 22.23.4 | Both exit 0: 1 passed; report `Result: PASS`. Product parity remains 6/25 available, 17 partial, 2 missing |
| Mobile `npm run lint`; `npx tsc --noEmit --pretty false` | 20.20.2 | Both exit 0: lint 0 errors / 75 warnings; TypeScript clean |
| Mobile `npm test -- --ci --watchAll=false --maxWorkers=2` | 20.20.2 | Exit 0 without `--forceExit`: `103 suites passed`, `505 tests passed`; existing worker timer teardown warning |
| `EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true npx expo export --platform ios --max-workers 2 --output-dir /tmp/ledgercraft-business-mobile-ios` | 20.20.2 | Exit 0: `Exported: /tmp/ledgercraft-business-mobile-ios` |

Real Chromium proofs also pass with no page errors:

- `node scripts/business-web-proof.mjs`: UI signup/company/customer/first invoice/payment/expense/account/report actions; supporting books through real HTTP; invoice PDF and unauthenticated paid share. Final run uses the production-preview build.
- `node scripts/business-gst-proof.mjs`: API-created fixture followed by real custom-period wizard, GST 210 minus 75 = 135, draft save/reload and PDF; no IRD submission.
- `node scripts/business-mobile-proof.mjs`: actual Expo web signup through invoices, full/partial receipts, expense approval/payment account, vendor/bill/payment, reports and GST draft reload. No authentication or transaction preseed.
- API health: `/api/healthz` 200 status ok; unauthenticated `/api/me` 401 UNAUTHORIZED.

## Screenshots

Actual local Chromium after screenshots; no before screenshots were captured. Desktop is 1440×900, phone is 390×844.

![Web posted profit and loss](https://github.com/jeevan-vj/ledger-craft-app/blob/codex/business-accounting-e2e/docs/evidence/business-accounting/web/08-profit-loss.png?raw=true)

![Web GST draft at phone width](https://github.com/jeevan-vj/ledger-craft-app/blob/codex/business-accounting-e2e/docs/evidence/business-accounting/gst/07-gst-draft-phone.png?raw=true)

### Mobile screenshots / device checks

Platform: Expo web in Chromium, 390×844 and compact 320×740. RNTL regressions cover expense create/edit/approval, vendor creation, GST loading/failure/save/refund/negative-adjustment guards, and active settlement-account filtering; 505 tests pass.

![Mobile GST draft](https://github.com/jeevan-vj/ledger-craft-app/blob/codex/business-accounting-e2e/docs/evidence/business-accounting/mobile/15-gst-draft.png?raw=true)

Device checks pending: signed iOS and Android onboarding persistence, keyboard/safe areas, expense approval, vendor/bill payment and GST preparation/save/reload. iOS bundle export does not establish device QA.

## Risk self-assessment

- [x] `risk:high`
- [x] Money/GST/accounting posting and report behavior
- [x] Auth permission mapping for the new reports-read endpoint
- [ ] Migrations/Drizzle schema, workflows, verification-policy changes, secrets or major dependency bumps

CODEOWNERS paths: `api/src/modules/auth/authorize-request{,.test}.ts`, `api/src/modules/purchases/purchases.journal.ts`, `src/services/taxCalculationService.ts`, `src/components/tax/GSTReturnWizard.tsx`, `mobile/src/screens/expenses/ExpenseCreateScreen.tsx`, `mobile/src/screens/expenses/ExpenseEditScreen.tsx`.

Diff: `git diff --numstat origin/main...HEAD` — 128 files, 6,896 text lines added/deleted; binary screenshots/PDFs are included in the file count.

Needs human review. No independent approval or auto-merge eligibility is claimed; do not auto-merge. Existing immutable journals and migrations are not rewritten.

## Remaining boundaries

Preparation is invoice-basis NZD only. Payments-basis and foreign-currency GST, automatic company income-tax calculation, and matching an already-recorded partial supplier payment remain unsupported. Verified supplier reconciliation imports a row then accepts it against the unpaid bill. Mobile manual capital journals remain unavailable. Email/provider credentials were not configured. Synthetic companies use no real IRD credentials; saving/exporting a draft is not filing a return.

## Rollback and after merge

Revert this PR to restore prior application behavior. There are no new schema migrations or destructive backfills; source documents and immutable journals created while deployed remain and require ordinary accounting corrections if needed. No deployment was performed. A human reviews and merges; run signed-device QA and confirm registered myIR periods/due dates before relying on the filing preparation.
