# Protect completed bank statements and show complete journal postings

Reconciliation declarations could make an unposted bank fee look like a book entry, and completed statements could still be changed through adjustments, backdated cash/manual journals, bank metadata or linked chart-account edits. Only valid bank-side timing differences and signed bank errors now adjust statements. Books remain the posted ledger, unsupported historical declarations surface review warnings, and completed bank cash cutoffs reject later changes. Names can still be corrected. No migration or original journal is rewritten.

Journal responses previously exposed only the first debit and credit, hiding GST on three-line journals. The API now includes every line and exact totals; web journal views and real spreadsheet-safe CSV downloads retain all postings. Legacy fields remain compatible.

## Expected versus actual

A separate synthetic company posts capital10,000; sales2,000+GST300 and a zero-rated sale500; receipt1,150; supplier bill1,000+GST150 with575 paid; expense200+GST30; and credit200+GST30. Both independent working paper and real Hono/SQLite report profit1,100, cash10,345, receivables1,420, payables575, invoice GST90 and payments GST45. November settlements and reversals preserve October reports and original journal lines. All13 journals balance individually.

Desktop and phone browser checks show statement0.14 minus a signed bank correction0.04 equals posted books0.10, difference0, then actual UI completion0.10. A historical unposted fee instead leaves books0/statement−10/difference−10; Expo displays the warning, sends no completion request and the API rejects completion400. Journal browser/CSV checks retain expense1,000 + GST150 against payable1,150.

## Verification evidence

| Job / command | Node | Result |
| --- | --- | --- |
| `pnpm lint` |22.23.4 |Exit0;0 errors/119 warnings |
| `pnpm type-check` (app + Node) |22.23.4 |Exit0;0 errors |
| `pnpm test:run` |22.23.4 |Exit0;146 suites/793 tests passed |
| `pnpm build` |22.23.4 |Exit0; postbuild verifies0.0.8/build62ec9ab8d0fe |
| `pnpm test:api` |24.22.1 |Exit0;101 suites/467 tests passed, no skips |
| `pnpm test:contracts` |24.22.1 |Exit0;35 suites/141 tests passed |
| `pnpm type-check:api` |24.22.1 |Exit0; API/contracts types clean |
| Exact CI readiness group + web sourcemap checker |22.23.4 |Exit0;23+1 tests passed |
| `verify-akaunting-core.mjs --report` |22.23.4 |Exit0; report generation does not establish full parity |
| Mobile lint / TypeScript / Jest |20.20.2 |Exit0;0 errors/74 warnings;115 suites/551 tests passed |
| Mobile `expo export --platform ios` |20.20.2 |Exit0; existing Jest teardown warning noted; no forceExit flag |
| Worker `wrangler deploy --dry-run` |24.22.1 |Exit0; nothing deployed |

[Each fix, raw expected/actual books and screenshots](docs/evidence/accountant-followup/README.md). [Independent local review](docs/evidence/accountant-followup/REVIEW.md). Screenshots are actual Chromium desktop1440×900 and phone390×844, including Expo web; they are not native-device captures.

## Risk and rollback

Risk: **high** (accounting, cash posting, contracts); CODEOWNERS includes `api/src/modules/purchases/purchases.journal.ts`. Human review is required; no auto-merge eligibility or approval is claimed. Labels have not been applied because GitHub API access is forbidden. Revert this follow-up commit to roll back; no migrations changed.

These are bank-statement cutoffs, not an organisation-wide fiscal/GST period-lock calendar or legal tax certification. Zero-rating eligibility is a synthetic-case assumption. Native iOS/Android, real inbox delivery, IRD acceptance and production-data audit remain unverified. No deployment, production correction or filing occurred.

Base: origin/main7ebbab0 (PR158 already merged). Follow-up branch: codex/accountant-close-followup. Remote PR/CI status cannot be verified here: GitHub GraphQL API access returns Forbidden. All results above are actual local checks, not claims of remote CI completion.
