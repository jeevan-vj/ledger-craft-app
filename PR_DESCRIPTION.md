## Business accounting flow and reviewed corrections

Complete the supported business flow across web and Expo: company setup, invoices and receipts, approved expenses and supplier payments, ledger-backed reports, GST preparation and an explicitly confirmed NZ-company tax worksheet. Existing supplier-payment matching preserves the original payment. Reviewed opening balances and historical corrections add balanced journals without rewriting source records.

Add posted credit notes, customer credit/refund accounting, reviewed foreign-document settlements to NZD banks, period-end AR/AP revaluation with next-day reversals, and historical ledger-based ageing. Lost-response recovery retains operation identities across invoice/bill payments, credits and refunds. Reports now preserve negative debit/credit sides, avoid doubled opening capital and disclose unallocated control-account balances instead of inventing customer documents. Invoice email changes require provider acceptance and preserve drafts when delivery cannot be acknowledged.

Remove existing raw web lint/TypeScript errors and make those checks mandatory in CI/release without error budgets. Deployment triggers and production resources are unchanged.

## Verification

- API:97 suites/453 tests passed, no skips. Contracts:34 suites/139 tests passed; strict API/contracts TypeScript clean.
- Web:142 suites/786 tests passed; raw lint0 errors/119 warnings; app and Node TypeScript clean. Latest production build0.0.8 hash59b37a1ff3e4 passed after the browser-discovered manual-match status fix; repeated web tests/lint/types pass.
- Mobile:115 suites/549 tests passed, strict TypeScript clean; lint0 errors/74 warnings (root mobile check0 errors/15 warnings); iOS/Android/web exports passed.
- Final Expo browser groups exited0 with no browser errors. Evidence includes27 primary screenshots and14 credit/FX screenshots. Web lost-response recovery passed5 cases with13 screenshots; web credit browser passed, with5 screenshots/results copied. Web FX browser passed desktop AR/phone AP160→170→160→settlement165 with gain/loss5 and zero errors; six screenshots/results are copied. Main web browser passed against59b37a1ff3e4 with13 screenshots,2 PDFs, no browser errors and confirmed statement completion without changing cash6,031/profit850/GST135. Mobile primary proof includes the final authoritative statement panel; credit/FX and recovery proofs predate unrelated later changes. No common browser build hash is claimed. All293 local web source files match the final build sourcemaps exactly.
- Exact CI readiness group:23 tests passed; separate web sourcemap check passed. Worker/Pages Wrangler dry runs exited0; nothing deployed.

See [expected versus actual accounting evidence](docs/evidence/accounting-completion/README.md). Counts represent separate executions and must not be added together.

Browser verification exposed and fixed manual-match status omission and a
reconciliation completion deadlock. Matching now explicitly confirms the action;
an authoritative posted-ledger summary provides the closing balance before
completion. Final full API, contracts, web and mobile gates pass after these
changes. No production resources were changed.

## Boundaries and review risks

Native iOS/Android devices were unavailable; Expo browser and bundle exports do not establish native keyboard/device behavior. Live inbox delivery is unverified because provider credentials/network access are unavailable; local HTTP/provider acceptance has14 passing tests. No production ledger audit/corrections, deployment, IRD filing or current-law certification occurred.

Foreign source documents support NZD bank settlement and AR/AP revaluation; native foreign-bank writes return422. Unverified historical FX requires review. Credit notes support standard/zero-rated/proportional allocation; non-proportional mixed-tax allocation needs a manual workflow. Company income tax is a reviewed worksheet, not full IR4 or loss/credit eligibility certification. Manual control journals without document attribution remain explicitly unallocated. The Akaunting catalogue report is not full parity:6/25 available,17 partial,2 missing.

This is a local PR description prepared on `codex/business-accounting-e2e`. Git fetch succeeded and origin/main remains base599b622. GitHub GraphQL and REST API access both return Forbidden, so PR creation is blocked despite working Git transport; no PR creation is claimed.
