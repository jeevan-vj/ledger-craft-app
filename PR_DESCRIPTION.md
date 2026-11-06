# Complete the selected GST settings, audited returns and invoice-compliance scope

GST settings were not persisted, the tax dashboard used a browser quarterly calendar, and return creation could retain caller-supplied totals. NZ invoice documents also omitted registration-effective GST identity and buyer-information checks. Web and Expo now use saved registration choices, server periods and exact canonical calculations for invoice, payments and hybrid bases. Draft revisions retain originals; filed records are immutable, with read-only original-settings recalculation and exact PDF exports. Filing records require explicit confirmation of a separate myIR submission; the app does not submit to IRD.

This is the user-selected scope of epic #115: Refs #84, #85, #111, #24. It does not complete or close the entire epic. It also fixes inclusive invoice preview/save parity and the Worker health endpoint's false-positive email capability for placeholder credentials.

## Accounting and browser evidence

Independent synthetic books match expected invoice/payments/hybrid net GST30/15/90; separate canonical snapshot books match75/36/111. Actual web UI checks135 invoice,141 payments and171 hybrid; a late receipt changes current hybrid to186 and original-payments recalculation to156 while the filed141 stays unchanged. Expo UI/PDF checks45/120/105. These are separate labelled companies, not alternate results for one dataset.

Tests cover registration ancestry through expense/invoice/bill reversals and credit refunds, eligible versus operational purchase gross, unknown zero-tax classification, unsupported tax rates, fingerprint staleness, client tampering, immutable revisions, future/overlapping filing, tenant isolation and permissions. The invoice boundary check preserves inclusive1,000 = net869.57 + GST130.43;1,000.01 and USD700 at reviewed NZD1,120 require buyer identification. All six web templates and mobile generators have registration-aware coverage.

[Expected/actual working papers, epic status, screenshots, PDFs and raw logs](docs/evidence/issue-115/README.md). [Independent local code review](docs/evidence/issue-115/REVIEW.md). Browser screenshots use real local Hono/SQLite, desktop1440×900 and phone390×844; Expo web is not installed-device acceptance.

## Local verification

pnpm11.19.0. All results are actual local checks; remote CI remains to be checked after PR creation.

| Command | Node | Actual result |
| --- | --- | --- |
| `pnpm lint` |22.23.4 |Exit0;0 errors /117 warnings |
| `pnpm type-check` |22.23.4 |Exit0; app and Node projects clean |
| `pnpm test:run` |22.23.4 |154 files /840 tests passed |
| `pnpm build` |22.23.4 |Exit0; postbuild0.0.8 /864ff69fb4d9 |
| `pnpm test:api` |24.22.1 |107 files /508 tests passed |
| `pnpm test:contracts` |24.22.1 |38 files /149 tests passed |
| `pnpm type-check:api` |24.22.1 |Exit0; API and contracts clean |
| Exact CI readiness group / web sourcemap checker |22.23.4 |Exit0;23+3 tests passed |
| `verify-akaunting-core.mjs --report` |22.23.4 |Exit0; open core parity still reported |
| Mobile lint / types / Jest |20.20.2 |Exit0;0 errors /74 warnings;123 suites /588 tests passed |
| Mobile `expo export --platform ios` |20.20.2 |Exit0; Hermes bundle exported |
| SQLite migration verification |22.23.4 |Exit0; schema/decimal/tenant constraints pass |
| Actual local Worker health HTTP test |22.23.4 |Exit0;4 passing entries |
| Pages compile / Worker TypeScript / Worker dry-run |22.23.4 |Exit0; nothing deployed |

The four full product suites total2,085 passing tests. Jest retains an existing worker-teardown warning; no `forceExit`, skipped failing case, quality-gate suppression or CI modification was introduced. All299 web application source-map entries match final source. Invoice browser evidence records build6489cf661d77; the subsequent CSS-only GST button wrapping fix is represented by final GST build864ff69fb4d9. Initial red/diagnostic runs and fixture corrections are disclosed in the evidence rather than counted as passes.

## Risk, rollout and limits

**Risk: high.** Migration/schema, tax/financial calculations, invoice issuance, shared DTOs, permissions and Worker paths require human/CODEOWNERS review. Independent local production review passed; its reviewer authored four reproducer tests at the builder's request, disclosed in the report. No external approval or auto-merge eligibility is claimed.

Migration0028 adds four nullable profile columns; historical SQL and source financial records stay unchanged. Existing unknown registration choices need explicit review. Confirm real IRD basis/frequency/calendar and classification before preparing a return. Unsupported mapping blocks filing rather than inventing myIR boxes. Current-law/accountant acceptance, native iOS/Android print/share and background behavior, live providers and deployment remain unverified. Calendar source limitations and mapping provenance are recorded in the evidence.

Rollback requires a reviewed application revert while retaining additive migration0028 and financial audit history. No destructive down migration, real filing, production correction or provider message is included.
