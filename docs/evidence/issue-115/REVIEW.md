# Independent local review — issue #115 GST slice

Base: `2397140`, branch `codex/issue-115-afirmo-parity`. This review covers the
selected GST work (#84, #85, #111 and #24), plus the narrowly scoped Worker
capability correction. It is not a review declaring the entire issue #115 epic
complete, an external PR approval, or a recommendation to merge.

## Current verdict

**LOCAL CODE REVIEW PASS — no outstanding confirmed blocker in the reviewed GST slice.**

This verdict covers local source, automated checks, and the recorded final
desktop/phone browser run. It is not formal PR approval.

The review found and the builder fixed a financial blocker: a receipt, invoice or bill posted before the GST
registration date is excluded initially, but its later reversal is still
included by movement date. A real local API probe returned November purchases
−230, input GST −30 and net GST +30 after deleting a pre-registration 230/GST 30
expense. The correct current-registration totals are zero because the original
claim was excluded. The original mapping warning prevented filing this example,
but the prepared figures were wrong. The fix traces the original organisation-bound
source journal date through reversals, settlements, credit notes and refunds.

Four real Hono/SQLite reproductions in
`api/src/modules/tax/gst-registration-reversals.test.ts` cover expense deletion,
invoice cancellation, supplier-bill voiding, and a paid customer credit/refund.
The first three failed on the original implementation; the fourth independently
failed too. Captured logs:

- `/tmp/issue115-review-prereg-reversals-red.log`
- `/tmp/issue115-review-prereg-refund-red.log`
- `/tmp/issue115-review-prereg-result.json` (actual HTTP probe)

The reviewer added those reproducer tests at the builder's request and has not
edited production code. They require builder review; the production assessment
is independent of the implementation authors.

A separate source-level threshold check identified that the original helper
skipped non-NZD invoices despite an existing reviewed NZD base amount. The
invoice owner corrected the threshold to use the reviewed NZD carrying amount,
with conservative buyer identification when no authoritative NZD amount exists. The review does not claim
the first unsuccessful FX fixture as a valid reproduction.

## Checks performed so far

- Organisation predicates and authenticated membership bind the new settings,
  periods, return snapshots and financial source reads. No client-supplied owner
  or organisation ID selects another company's data.
- New GST settings writes require `settings.write`; draft/filing mutations
  require `banking.write`. Ordinary report read access is insufficient.
- Exact decimal helpers drive hybrid calculations, source gross classification,
  return differences and myIR preparation fields. No SQL money aggregation or
  client-authoritative GST total was introduced in the reviewed paths.
- Migration 0028 adds only four nullable profile columns. Existing migration SQL
  is not edited; the manifest is generated rather than handwritten.
- Unknown legacy registration choices remain unknown. The first period is
  clipped to the confirmed registration date; settings changes do not silently
  overwrite saved return calendars or snapshots.
- Draft snapshots are server calculated and retained. Tampered totals/source
  fingerprints are rejected, filed records remain read-only, and recalculation
  uses original saved settings without writing over the recorded return.
- Source-based eligible purchase gross is separate from all operational
  purchases. Missing or unsupported classifications remain unknown; zero GST
  does not automatically establish zero-rating or exemption. Ambiguous myIR
  fields are omitted instead of filled with fabricated adjustments.
- GST seller identity, registration date and buyer identification are checked
  at invoice issuance boundaries, with six web templates and mobile generators
  using the shared registration facts. Public buyer information is limited to
  printed supply-information fields, not private customer notes.
- Worker health selects email availability through the same configured-mailer
  factory as actual delivery, including the known placeholder-key case.

## Verification status

Independent targeted re-verification passed: two files and twelve tests (the
four reversal cases plus eight invoice GST compliance cases), exit 0, captured in
`/tmp/issue115-review-fixes-green.log`. The foreign-currency test now exercises
the reviewed NZD threshold successfully.

The final combined logs supersede the initial failed fixture run:

| Check | Final result | Local evidence |
| --- | --- | --- |
| API | 107 files / 508 tests passed | `/tmp/issue115-api-final.log.tests` |
| Contracts | 38 files / 149 tests passed | `/tmp/issue115-contracts-final.log` |
| Web | 154 files / 840 tests passed | `/tmp/issue115-web-final2.log` |
| Mobile | 123 suites / 588 tests passed | `/tmp/issue115-mobile-all-final.log` |
| Readiness | PASS | `/tmp/issue115-readiness-final.log` |
| Worker / Pages | Dry-run and compilation succeeded | `/tmp/issue115-worker-dryrun-final.log`, `/tmp/issue115-pages-final.log` |

The builder reports all project types and lint checks completed with zero errors;
the inspected web lint log retains 117 warnings. The mobile test runner reports a
worker forced-exit/teardown warning after all suites pass. Neither result is
represented as a warning-free run.

The final source-delta review covered the explicit standard-sales-tax guard,
shared quote/invoice line tax and discount forwarding, exact mobile NZD base
amount, and phone button wrapping. No additional confirmed blocker was found.
A final SHA-256 source snapshot is retained in
`/tmp/issue115-reviewed-production-hashes-final.json`; evidence-only updates do
not alter the reviewed production snapshot.

Expo-web browser execution reports real Hono/SQLite settings, three basis
calculations, canonical snapshots, real PDF downloads and filed-record reload /
immutability with no page errors (`/tmp/issue115-mobile-browser-final.log` and
`docs/evidence/issue-115/mobile/results.json`). This is browser-based Expo
verification, not native-device execution.

Final responsive-web execution passed on desktop 1440×900 and phone 390×844,
using build `864ff69fb4d9`: real signup/source documents, GST settings and periods,
payments GST 141 saved/filed-record/PDF, hybrid 171 then 186 after late activity,
and read-only original-payments recalculation 156 against retained 141, a change
of 15. No page errors were recorded. Evidence:
`/tmp/issue115-web-browser-final3.log` and
`/tmp/ledgercraft-issue115-gst-web-final3/results.json`, linked from the central
[verification report](README.md). The root agent reports visual inspection of
the desktop worksheet, phone recalculation, mobile and invoice screenshots.

The prior final2 capture attempt changed responsive layout during element
capture and lost its panel. The final3 driver uses viewport screenshots; this
was an evidence-driver correction with no product-source delta. SHA-256 checks
against the final production snapshot found no changed production files after
review.

## Risk and limits

Risk is **high**: migration/schema, tax calculations, invoice validation,
permissions and Worker wiring are affected. Auto-merge is **not eligible**;
CODEOWNERS and human review/merge remain required. No labels, approval,
deployment, real filing or external review comment was issued by this reviewer.

Published calendar and secondary NZ tax-system source references help cross-check
the implementation; they do not establish current-law certification or IRD
acceptance. Native iOS/Android operation, live email/AI/payment/bank-provider
acceptance and owner-required production setup remain distinct from local tests.
