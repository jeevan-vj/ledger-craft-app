# Issue #115: GST implementation and accounting verification

Verified locally on **7 November 2026, Pacific/Auckland**. Base main `2397140`;
branch `codex/issue-115-afirmo-parity`. The user selected **#84/#85/#111/#24**.
This PR implements that GST scope on the API, responsive web and Expo. Epic #115
remains open. All transactions, companies and filing references here are synthetic.

## What changed

- Persisted GST registration-effective date, invoice/payments/hybrid basis,
  frequency and ending-month anchor. Legacy null choices stay unknown and need
  explicit confirmation. Migration0028 adds four nullable columns; applied SQL
  is unchanged.
- Server periods include the registration stub, monthly/two-/six-month periods,
  November/January and March/May exceptions, weekends and published national
  holidays. Published-source limitations warn to confirm dates in myIR.
- Exact server GST snapshots (`gst-ledger-v2`) include settings, financial source
  IDs/counts, stable SHA256 fingerprints, supported myIR boxes and warnings.
  Client totals cannot override them. Draft revisions preserve originals; filed
  returns are immutable, and recalculation compares current books under original
  settings without replacing the record. No HTTP call submits a return to IRD.
- GST-eligible purchase gross comes from actual sources, not reverse-calculating
  rounded tax. Zero tax does not establish exemption or zero-rating. Missing,
  stale or nonstandard tax classification omits unsupported boxes and blocks
  filing rather than inventing adjustments.
- Pre-registration sources and their later reversals, credits and refunds stay
  excluded. Reporting outside GST retains its original scope.
- Effective NZ seller registration, GST number, Tax invoice labels and buyer
  identification checks apply to issuance, share and send. The NZ$1,000 threshold
  uses authoritative NZD base totals for foreign invoices. Existing document
  snapshots and historical source amounts remain unchanged. All six templates
  and mobile HTML generators use the registration facts.
- Inclusive invoice preview and save now use the shared totals calculation and
  preserve the inclusive flag. Placeholder email credentials no longer make the
  Worker health endpoint report delivery as available.

## Expected versus actual

These are separate isolated books, not differing results for one company.

| Scenario | Independently expected | Actual |
| --- | --- | --- |
| API registration working paper: sale1,000+150, receipt575; bill600+90, payment230; expense230/GST30 plus exempt50 | Invoice net GST30; payments15; hybrid90; pre-registration115/GST15 excluded | All three match; source snapshots retained |
| Canonical snapshot working paper | Invoice75; payments36; hybrid111 | All three match saved server snapshots ([details](gst-calculation/README.md)) |
| Web closed October books | Invoice135; payments141; hybrid171 | Browser driver checks these values; see [final web evidence](web/README.md) |
| Web late October receipt | Current hybrid186; original-payments recalculation156; difference15; filed141 unchanged | Browser driver checks source fingerprint, original JSON and PDF |
| Expo isolated books | Payments45; hybrid120; invoice105 | All three actual UI flows match; draft/filed PDFs match ([details](mobile/README.md)) |
| Registration ancestry regression | Later reversal of excluded expense, invoice, bill or paid credit/refund contributes GST0 | Four real Hono/SQLite cases pass |
| Inclusive invoice boundary | Total1,000, net869.57, GST130.43;1,000.01 requires buyer identification | Actual phone UI/save and API assertions match |
| Foreign invoice boundary | USD700 at reviewed1.6 gives NZD1,120; buyer identification required | API and shared web/mobile tests reject missing details |
| Calendar | October31 due November30; November30 due January15; March31 due May7, adjusted for nonworking days | Shared calendar/API/UI tests and browser overview match |
| Integrity / permissions | Tampered totals422; stale source409; immutable filed change409; member/read-only write403; other company404 | Real API tests pass |

Source calculations and mapping provenance: [settings](gst-settings-evidence.md),
[calendar sources](nz-calendar-sources.md), [myIR mapping review](gst-mapping-review.md).
Published calendar and secondary Odoo tax-report data are cross-checks, not legal
certification or IRD acceptance.

## Complete local verification

pnpm11.19.0; no failing test was skipped. These are local results, not remote CI.

| Command | Node | Result |
| --- | --- | --- |
| `pnpm test:api` |24.22.1 |107 files /508 tests passed, exit0 |
| `pnpm test:contracts` |24.22.1 |38 files /149 tests passed, exit0 |
| `pnpm type-check:api` |24.22.1 |API and contracts exit0 |
| `pnpm test:run` |22.23.4 |154 files /840 tests passed, exit0 |
| `pnpm type-check` |22.23.4 |App and Node projects exit0 |
| `pnpm lint` |22.23.4 |0 errors /117 warnings, exit0 |
| `pnpm build` |22.23.4 |Postbuild verified0.0.8 /864ff69fb4d9, exit0 |
| Exact CI readiness group of four test files |22.23.4 |23 passed /0 failed, exit0 |
| `node --test scripts/upload-web-sourcemaps.test.mjs` |22.23.4 |3 passed /0 failed, exit0 |
| `node scripts/verify-akaunting-core.mjs --report` |22.23.4 |Exit0; open parity gaps remain reported |
| Mobile `npm test -- --ci --watchAll=false` |20.20.2 |123 suites /588 tests passed, exit0 |
| Mobile `npx tsc --noEmit`, `npm run lint` |20.20.2 |Exit0;0 errors /74 warnings |
| Mobile `npx expo export --platform ios` |20.20.2 |Hermes bundle export exit0; no device run |
| `node api/sqlite-migrations/verify.mjs` |22.23.4 |Schema/decimal/tenant/constraint baseline passed, exit0 |
| `node --test scripts/issue-115-worker-health.test.mjs` |22.23.4 |4 passing entries, actual local Worker HTTP cases, exit0 |
| `wrangler pages functions build functions` |22.23.4 |Compile exit0 |
| `tsc --noEmit -p deploy/api/tsconfig.json` |22.23.4 |Exit0 |
| `wrangler deploy --config deploy/api/wrangler.jsonc --dry-run` |22.23.4 |Compile exit0; nothing deployed |

The four full product suites total **2,085 passing tests**. Additional checker
and HTTP tests are listed separately. [Raw final logs](checks/) and
[mobile logs](mobile/) retain output. Jest reports a worker teardown warning;
no `forceExit` or weakened quality gate was introduced. Builds retain existing
chunk-size warnings. All299 application source-map entries matched the final
web source. Invoice browser evidence records earlier build6489cf661d77; the
subsequent web change wraps two long GST action buttons, and final GST browser
capture uses864ff69fb4d9.

The first refreshed web screenshot attempt lost transient page state when element
capture resized the responsive viewport; a fresh run using fixed viewport
captures completed both workflows with no page errors.

Initial diagnostic failures are not passes: the first API run had457 passes /
45 failures due to unconfirmed old fixtures and eligibility defects; the first
contracts run had two outdated assertions that hybrid was unsupported. Fixtures
now explicitly confirm real registration choices and preserve financial
assertions. Independent review reproduced the pre-registration reversal bug
before the fix. Classification and inclusive-preview regressions were likewise
reproduced before correction. A first restricted-process readiness attempt
failed; the exact command then passed with supported host process access.

[Independent local review](REVIEW.md) records findings, final production delta
and authorship boundaries. High risk: human/CODEOWNERS review is required;
no approval or auto-merge eligibility is claimed.

## Screenshots and PDFs

- [Responsive web GST workflow and PDFs](web/README.md)
- [Expo GST settings, three bases, saved records and six downloaded PDFs](mobile/README.md)
- [All six invoice templates, phone boundary checks and actual invoice PDF](invoices/README.md)

These are actual Chromium screenshots against real local authenticated API and
SQLite records. Expo web is not installed iOS/Android. Native print/share sheets,
keyboard/background behavior and device release acceptance remain unverified.

## Epic status and remaining work

Baseline public GitHub state: **4 closed /16 open** linked issues. This table
separates that state from this PR; it does not close issues automatically.
The baseline audits describe main before this implementation:
[money-in](money-in-audit.md), [tax/reports](tax-reports-audit.md), [mobile](mobile-audit.md).

| Linked issue | GitHub baseline | Status / remaining work |
| --- | --- | --- |
| #84 GST settings/calendar |Open |Implemented locally in this PR; owner confirms actual IRD choices |
| #85 canonical GST calculations |Open |Implemented locally in this PR; accountant/myIR review still required |
| #111 registration/documents/overview |Open |Implemented locally in this PR; no legal certification |
| #24 mobile GST |Open |Expo flows implemented and browser verified; installed-device acceptance remains |
| #105 live email/AI |Open |Core wiring exists; provider credentials and live acceptance remain; placeholder capability bug fixed here |
| #106 account deletion |Closed |Already implemented; no new gap established |
| #30 native/store QA |Open |Owner/device/release acceptance remains |
| #87 Stripe Phase1 |Open |Core Checkout exists; live acceptance plus refund/payout/dispute/admin work remain |
| #107 recurring API/web |Closed |Already implemented |
| #28 mobile recurring |Open |Full invoice/bill schedule editor remains |
| #108 Akahu |Open |Integration missing; provider setup and implementation required |
| #109 reconciliation |Closed |Already implemented |
| #22 mobile CSV/reconciliation |Open |Mapping/adjustment workflow gaps remain |
| #21 mobile bank workspace |Open |Default account, movement pagination and FX transfer UI remain |
| #110 statements/reminders |Open |Customer statements and reminder scheduling missing |
| #112 report improvements |Open |Period columns, NZ presets, PDF and performance acceptance remain |
| #25 mobile reports |Open |Basic summary exists; full report parity remains |
| #60 quotes |Closed |Already implemented; live delivery/device checks separate |
| #113 receipt inbox/PDF scan |Open |Inbox, PDF extraction route, duplicate review and auto-scan remain |
| #114 tax wallets/payroll |Open, parked |Explicit owner build/partner/drop decision; intentionally not implemented |

No deployment, production-book rewrite, real recipient message, native-device
pass, live Stripe/Akahu acceptance or IRD submission occurred. A company-wide
accounting-period lock and amended-return filing workflow are outside this PR.
Rollback application code with a reviewed revert; retain additive migration0028
and existing saved audit records rather than deleting financial history.
