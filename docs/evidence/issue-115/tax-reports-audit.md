# Issue #115: GST, reports, receipts and quotes audit

Audit date: 7 November 2026 (Pacific/Auckland). Base: main `2397140`.
This is a source/spec audit; references to existing tests are not claims that
those tests were rerun during this audit. Issue states were read from the public
GitHub issue pages because GraphQL API access is forbidden.

## Status against the linked acceptance criteria

| Issue | GitHub state | Current implementation | Outstanding acceptance criteria |
| --- | --- | --- | --- |
| #84 GST basis/frequency | Open | GST preparation supports explicitly selected invoice/payments basis, with exact partial settlement allocation and draft basis metadata. | No organisation-saved payments/invoice/hybrid basis, filing frequency, period anchor, or IRD period generator. Hybrid is unsupported. Due dates are entered by the user; the legacy IRD dashboard still derives quarterly dates. |
| #85 auditable server GST | Open | Company-scoped exact-decimal `GET/POST /api/tax/gst-preparation`; invoice/payments allocations, credits/reversals, supported expense claims, reviewed manual adjustments and FX warnings. Filed records are immutable. | Does not consume saved #84 settings; no calculation version, explicit myIR box map, immutable source-record IDs/counts/hash snapshot, or recalculation difference view. Draft create/update still accepts caller-supplied totals rather than recomputing/validating them. |
| #111 GST document compliance/registration/overview | Open | Registration status and seller `taxId` exist; there is a list of saved returns and myIR reference recording. | Registered documents still default to `INVOICE`; web templates do not print seller GST number; mobile maps `taxId` but does not render it. No GST check-digit validation, registration-effective date, >NZ$1,000 buyer-identifier guard, or generated missing/draft/filed/overdue period overview. A saved-return list is not that overview. |
| #112 reporting polish | Open | Ledger-authoritative statements, cash/accrual, comparison and filters, CSV and general ledger. | No optional monthly/quarterly columns, shared NZ FY/date presets, report PDF export, wide-column CSV, or 10k-line/12-column performance regression. This is unblocked by provider credentials. |
| #113 receipts inbox/PDF/auto-scan | Open | Image receipt scan/provider selection and capability gating; single-file photo/PDF upload; explicit user review; stored receipt link. | Receipt PDFs still go through `image_url`, not the existing PDF extraction path. No multi-file auto-scan/inbox state machine, expense-receipt duplicate hash/vendor-date-amount review, or camera auto-scan/manual fallback with the same attachment. Scanned proposal amounts currently use numbers, not the AC's exact decimal-string fields. Production scan also needs configured AI access. |
| #60 Quotes & Estimates | Closed | Dedicated quote/estimate entity, totals reuse, CRUD/revise/share/public response/convert and web/mobile flows are present. Runtime mailer now implements `sendQuote`, and quote service invokes it before marking sent. | No new MVP code gap established by this audit. Real provider delivery/device acceptance remain separate evidence requirements; older docs saying quote send is always unavailable are stale. |
| #114 tax wallets/payroll/provisional tax | Open, explicitly parked | Reviewed company-tax worksheet exists as a bounded separate feature; no wallet/payment-initiation or payroll product was identified. | Owner build/partner/drop decisions remain outstanding. The issue explicitly excludes implementation now; do not unpark it implicitly. A company worksheet is not full IR4/provisional/PAYE capability. |

## Source and existing regression evidence

- **#84:** `packages/contracts/src/business-profile.ts` and
  `api/src/db/schema/business-profiles.ts` have only `gstRegistrationStatus`;
  `packages/contracts/src/gst-preparation.ts` accepts invoice/payments only.
  `src/pages/IRDReportingPage.tsx:46` still computes a quarterly next due date.
  The current `GstPreparationPanel` asks for a due date and selected basis;
  that is not a stored IRD registration choice.
- **#85:** `api/src/modules/tax/gst-preparation.ts`, `gst-payments.ts`, and
  `gst-preparation.repository.ts` derive current values. Existing
  `tax-completion.e2e.test.ts`, `gst-payments.test.ts`, credit-note tests and
  `reports/accountant-month-close.e2e.test.ts` cover exact values and periods.
  `tax.service.ts:createTaxReturnForUser/updateTaxReturnForUser` insert/update
  caller totals; `bindPreparationAudit` binds actor metadata, not source figures.
  `gstPreparationResponseSchema` has totals/review/warnings but no box/source/version snapshot.
- **#111:** `src/components/invoice/preview/documentLabels.ts` defaults to
  `INVOICE`; all six `preview/templates/*.tsx` render generic tax rows but no
  seller GST number. `mobile/src/utils/invoiceTemplates.ts:137` maps the tax ID
  without printing it. `business-profile.ts` accepts `taxId` as arbitrary text;
  neither contract/schema contains `gstRegisteredFrom`. Invoice create/send and
  web/mobile forms have no total-over-1,000 buyer-identifier rule.
  `src/components/reporting/IRDReportingDashboard.tsx` lists existing returns,
  using a single `nextGSTDueDate` for overdue checks, rather than generated periods.
- **#112:** `packages/contracts/src/report.ts:financialReportQuerySchema`
  has no `columns`; the strict schema rejects that key. `reports.service.ts`
  loads posted rows and calls pure `buildFinancialReport`. The response only
  has aggregate statements/comparison. `FinancialReportsPage.tsx` offers date
  inputs, basis and CSV, and defaults the range to January 1/current UTC day.
  It has no preset picker or PDF action. Existing page tests cover the current
  aggregate reports, not #112's new acceptance criteria.
- **#113:** `api/src/modules/ai/openai.ts:createOpenAiReceiptScanner` sends
  every content type as an image URL in both remote and Workers AI branches.
  `invoice-imports/extraction/document-content.ts` already contains PDF text
  extraction. `ReceiptUpload.tsx` holds a single `File`, uploads before a
  separate Scan action, and capability-gates the scan tab. Web
  `openaiReceiptService.isAvailable()` uses `/healthz` capabilities correctly.
  Mobile `ReceiptScanner.tsx:takePhoto` only sets the image; scanning requires a
  later button press. No expense inbox/hash pipeline was found.
- **#60:** `api/src/modules/quotes/quotes.service.ts:sendQuoteForUser`,
  `invoices/resend.ts:sendQuote`, quote integration tests, shared quote routes,
  and web/mobile quote screens implement the closed issue's MVP paths.

Important accounting interpretation: archiving a legitimately issued document
must not erase its historic GST journal. #85 lifecycle wording should not be
implemented as a blind exclusion of every archived issued invoice. Preserve the
current dated journal/reversal authority while excluding unposted drafts.

## Proposed bounded implementation for unblocked #112 / #25

1. **Contract first:** optional `columns: none|month|quarter`; omitted/none keeps
   the previous response unchanged. Add an optional column block containing
   date-only period definitions, exact P&L/cash-flow rows and metrics, plus full
   range totals. Do not add client total calculations or SQL `SUM` on money.
2. **One database snapshot:** load the requested posted period/opening rows once
   in the existing organisation transaction. Reuse the pure existing report
   engine for each clipped month/quarter with cumulative opening rows. Avoid
   calling the repository, receivables or payables queries for every column.
   Keep comparison and account/customer/vendor filters consistent. Bound the
   requested number of columns to avoid unbounded work.
3. **Independent API acceptance:** real SQLite fixture across April–March,
   explicit empty months and boundary dates; compare every column to its
   independent single-period report and totals to the aggregate. Test month and
   quarter, cash/accrual, filters and tenant isolation. Seed 10k journal lines
   directly in the fixture and measure the 12-column request against a declared
   timeout budget; do not invent a passing performance claim from a tiny fixture.
4. **Shared date presets:** a pure shared helper derives the date in
   `Pacific/Auckland` from an injectable instant, then does date-only UTC-safe
   calendar arithmetic. This/last month, quarter, financial year, and financial
   year-to-date; default balance month March, configurable year-end month.
   Example 27 Oct 2026 -> FY2026-04-01..2027-03-31. Test NZ midnight, UTC/date
   boundary, leap years, and a non-March balance month. Do not invent a `This GST
   period` preset until #84 supplies the actual saved frequency/anchor.
5. **Web:** preset/columns controls, horizontally scrollable account table,
   sticky account column, server values only; CSV includes all columns. PDF
   includes business name, basis, range and generated-at, uses landscape in
   column mode, and has readable P&L/balance-sheet output. Test actual downloaded
   files and desktop1440/phone390 views, not only a mocked export call.
6. **Mobile #25:** consume exactly the same contract/helper. Use horizontal
   period tables and the existing Expo print/share path, with native-device
   testing labelled pending unless it was actually performed.

This slice can be delivered without pretending the broader epic is complete.
#84/#85/#111/#113 remain material backlog; #105/#30/#108 also have separate
production/provider/store requirements covered by the other audit specialists.
