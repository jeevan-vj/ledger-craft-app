# GST box mapping: bounded source review

Reviewed 7 November 2026 (Pacific/Auckland). This is a read-only implementation
cross-check for issue #85, not current-law certification or IRD filing acceptance.
The source review itself did not change application code, stored journals or
production data. A subsequent source-classification helper is described below.

## Source and provenance

The environment permits GitHub and raw GitHub content, but the official IRD host
is not in the network allowlist. No alternate route was used to bypass that
restriction. The following public Odoo New Zealand localisation sources were
retrieved and then pinned to commit
`9a2a3c8694fe7d5e6b97a3d2fc1a337e54a21189`. The pinned files have identical hashes
to the branch files originally inspected.

- [NZ GST report definitions](https://raw.githubusercontent.com/odoo/odoo/9a2a3c8694fe7d5e6b97a3d2fc1a337e54a21189/addons/l10n_nz/data/account_tax_report_data.xml)
  — SHA256 `10852a4d69e29c873b88970f11fa30cba353c4af6f0d754fa76575c99fea135d`.
- [NZ tax classifications and report tags](https://raw.githubusercontent.com/odoo/odoo/9a2a3c8694fe7d5e6b97a3d2fc1a337e54a21189/addons/l10n_nz/data/template/account.tax-nz.csv)
  — SHA256 `2f22f707632599a3df5aca6a21b7e6fefc1d3693faa97878179625e257fa420b`.

These are auditable secondary implementation sources, not an official IRD
publication. The public Xero finance OpenAPI inspected during this review did
not contain a NZ GST return schema and supplied no additional verification.

## What the source actually says

| Box | Odoo NZ report label/formula |
| --- | --- |
|5 |Total sales and income, including GST and zero-rated supplies |
|6 |Zero-rated supplies included in Box5 |
|7 |Box5 minus Box6 |
|8 |Box7 multiplied by3 and divided by23 |
|9 |Adjustments from the calculation sheet |
|10 |Box8 plus Box9 |
|11 |Purchases and expenses including GST for which tax-invoicing requirements have been met |
|12 |Box11 multiplied by3 and divided by23 |
|13 |Credit adjustments from the calculation sheet |
|14 |Box12 plus Box13 |
|15 |Box10 minus Box14 |

The tax-template source adds important classification evidence:

- A15% purchase tags both its base and tax amounts into Box11.
- A0% GST-free purchase has no Box11 tag.
- A0% Zero/Export sale explicitly tags its base into both Box5 and Box6.
- GST-only import tax is tagged into Box13, rather than manufacturing a gross
  purchase amount for Box11.

## Consequences for LedgerCraft

The existing reference fixture has operational purchases625, including50 exempt,
and input GST75 from GST-bearing gross575. **625 cannot be presented as Box11
while claiming that Box12 is the form's3/23 calculation yielding75.** The
secondary source supports keeping the GST-free50 outside the eligible gross
purchase box. Operational purchases and GST-eligible purchases must have
separate names and provenance.

Do not infer eligible gross by reversing rounded GST. For example, rounded GST
of13.04 does not uniquely reconstruct the original gross amount100.01. Keep
source gross, treatment, claimable percentage and private-use evidence; conserve
their own rounded cents. Where that evidence cannot be reconstructed, mark the
box mapping as requiring confirmation instead of inventing a value.

A zero tax amount alone also does not establish that a sale is an eligible
zero-rated export. The inspected source explicitly distinguishes that tax code.
Legacy unclassified sales therefore need an audited zero-rated/exempt review
before automatic box mapping. The source does not independently establish all
legal rules for exempt income or current IRD exceptions; that remains a separate
tax-policy verification requirement.

Recommended conservative output while classification is incomplete:

- Preserve exact source-ledger GST and operational totals.
- Return `mappingStatus: requires_confirmation` (or equivalent) and an explicit
  explanation; omit or return null for unsupported form-box values.
- Retain signed reviewed adjustments, source references and reviewer identity.
- Never describe unverified operational totals as a completed IRD return, and
  never silently substitute a3/23 calculation for the actual source GST.

For a simple, fully evidenced15% case, these sources corroborate the numerical
box relationships. They do not prove current-law eligibility, live myIR
acceptance, or the treatment of every mixed-rate, exempt, import or private-use
case.

## Source-classification implementation follow-up

`api/src/modules/tax/gst-classification.ts` now classifies eligible gross from
stored receipt/bill evidence and immutable posted movements, not by reversing
rounded GST. Its separate return fields are operationally distinct:
`claimablePurchases` is a source-derived amount or null, `unclassifiedSales`
requires an explicit zero-rated/exempt review, and
`salesClassificationSupported` is false when source evidence is insufficient.

Ten real Hono/SQLite tests pass in
`api/src/modules/tax/gst-classification.test.ts` (captured output:
`/tmp/issue115-gst-classification-final4.log`):

| Source case | Expected and actual |
| --- | --- |
|Taxable expense230 + exempt expense50 + taxable received bill345 |Eligible invoice-basis gross575, not625 |
|Same paid expense230 + supplier instalment69 |Eligible payments/hybrid gross299, not349 |
|Half-claim receipt230 plus independently rounded receipt100.01 |Eligible gross115+100.01 =215.01 |
|Mixed taxable/untaxed sale with an untaxed line50, half received |Unclassified invoice/hybrid50; payments25 |
|Later reversal of that receipt |October remains25; November movement−25 |
|Untaxed sale100, unpaid credit20, receipt80, paid credit/refund20 |Invoice and payments unclassified gross60 |
|Source supply/bill before registration, receipt/payment after it |Excluded from eligible classification under the explicit registration policy |
|Missing historical receipt, unexplained non-standard GST, or mixed-sale document discount |Unknown/null purchase gross or unsupported sales classification, with warnings |
|Manual GST-control posting without a classified source document |Unknown purchase gross /unsupported sales classification; no zero gross invented |
|Sale100 with an explicitly declared10% tax assignment |Unsupported sales box classification; original GST remains10.00 |

Tests were written before the helper. Additional regressions captured an
incorrect full230 claim for a receipt with unexplained GST15, a credit reducing
unclassified sales80 while the initial implementation still returned100, and
registration/support-flag cases, before their fixes. The initial mixed-tax fixture
also omitted the API-required tax assignment id; that fixture was corrected
without changing any monetary expectation.

The non-standard sales-rate regression first returned supported classification
for a declared10% tax. Its guard now checks the actual stored assignment metadata:
automatic sales mapping requires a single positive15% assignment per taxed line.
Unknown, non-standard or multiple positive tax assignments require source review;
no new GST formula or change to stored tax amounts was introduced.

All arithmetic uses existing exact decimal helpers and the cumulative settlement
allocator. Original journal/source amounts are not rewritten. These tests
establish implementation behavior, not a complete tax-policy opinion.
