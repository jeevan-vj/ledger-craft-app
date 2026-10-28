# Akaunting Feature Parity Audit and Backlog

Audit date: 2026-10-02
LedgerCraft baseline: `mobile-app` at `c5d66d6`
Akaunting baseline: [`akaunting/akaunting` at `edde6b54`](https://github.com/akaunting/akaunting/commit/edde6b54f27ee0635b9a5dbde52117d441a18195), 2026-09-29

## Scope and decision

Required parity means functional coverage of the open-source Akaunting core in the linked GitHub repository. It does not mean copying Akaunting's UI or source code. LedgerCraft keeps its Revolut-inspired web design, Wise-inspired native design, Hono API, Better Auth, exact decimal money rules, organisation isolation, and Cloudflare SQLite deployment.

Akaunting also exposes more than 100 optional marketplace apps. Those are not silently included in the core-parity promise. Major first-party modules are inventoried separately below and each needs an explicit product decision. Third-party marketplace integrations are represented by a capability framework task rather than one task per vendor.

Evidence was taken from:

- [Akaunting core admin routes](https://github.com/akaunting/akaunting/blob/master/routes/admin.php)
- [Akaunting core API routes](https://github.com/akaunting/akaunting/blob/master/routes/api.php)
- [Akaunting navigation and default features](https://akaunting.com/hc/docs/the-user-interface/navigation-menu/)
- [Akaunting invoices and estimates](https://akaunting.com/hc/docs/invoices-and-estimates/)
- [Akaunting bills](https://akaunting.com/hc/docs/bills/)
- [Akaunting banking and reconciliation](https://akaunting.com/hc/docs/banking-feeds-reconciliations/)
- [Akaunting users, roles, and client portal](https://akaunting.com/hc/docs/users-and-roles/roles-and-permission-levels/)
- [Akaunting settings](https://akaunting.com/hc/docs/settings/)
- [Akaunting import/export](https://akaunting.com/hc/docs/import-export/)
- [Akaunting app model](https://akaunting.com/hc/docs/apps-and-integrations/what-are-apps/)

## Status legend

- **Available**: an organisation-scoped API and usable web workflow exist, with meaningful automated coverage.
- **Partial**: some capability exists, but an Akaunting core workflow, persistence path, or verification gate is missing.
- **Missing**: no production domain/API/UI workflow exists.
- **Extension**: an optional Akaunting module, not part of the open-source core baseline.

File presence alone is not treated as feature completion. Mock-only UI, client-only calculations, and providers that intentionally return unavailable are classified as partial or missing.

## Comparison summary

| Capability | LedgerCraft status | Evidence and remaining gap |
| --- | --- | --- |
| Business dashboard | Partial | Date-filtered summary, receivables, payables, cash and tax widgets map from posted-ledger reports; recent activity is explicitly operational. Per-user layouts and saved report definitions persist in SQLite and sync to web/mobile. An expenses-by-category widget and journal-line drill-down for every total remain open. |
| Products and services | Partial | Core item/category CRUD now includes hydrated category detail, active state, duplicate, atomic bulk actions, canonical CSV preview/apply/export, strict price/tax validation, profile-currency display, and sale-safe invoice selection. Media and per-item multi-tax behavior remain open. |
| Customers | Partial | Organisation-scoped CRUD exists, including one address string. Contact people, enable/disable, duplicate, bulk import/export, statements, and portal login are missing. |
| Sales invoices | Partial | Create/list/detail/update, numbering, exact totals, templates, PDF, public share, payment capture, reminders, cancel/restore/archive, duplicate, history, line discounts, multiple line taxes, attachments, and CSV import/export exist. Recurring invoices are the recurring-activity row. Send and remind return 503 `EMAIL_UNAVAILABLE` unless a mail provider is configured. |
| Invoice payments and receipts | Available | Invoice-linked payments, partial/full status updates, payment receipts, and balanced payment journals exist. |
| Vendors and bills | Partial | The API implements vendor contacts/defaults, exact bills, split payments, attachments, history, cancel/restore, and vendor CSV plus bill export. Web page tests cover the import link and do not exercise cancel, restore, or split payment. Recurring bills are the recurring-activity row. |
| Expenses | Available | Expense and category CRUD, tax amounts, account/customer links, receipt reference, and web/mobile entry flows exist. Approval policy, claims, reimbursements, and recurring expenses are extensions/gaps. |
| Payment/bank accounts | Partial | Bank-account CRUD and accounting accounts exist. Expo account list/filter/create/detail/edit/delete-attempt and exact balance fields are implemented locally. Default payment account, account statements/performance, bulk enable/disable, and a unified posting model are incomplete. |
| Banking transactions | Available | Manual income/expense create, update, and delete, exact splits, invoice/bill connections, attachments, duplicate, print/PDF, CSV export, and mobile CSV preview/import exist. `api/src/modules/bank/bank.test.ts` covers splits, connections, duplicate, and export. |
| Transfers | Partial | `POST /api/bank-transfers` posts idempotent equal-and-opposite reconciled legs for same-currency transfers and for cross-currency transfers that name a persisted reviewed rate. Web `BankTransferDialog` and mobile `BankTransferFormScreen` do not send `exchangeRateId`. Transfers have no edit or void lifecycle. |
| Reconciliation | Available | Sessions, matches, confirmation, adjustments, completion, and history exist. Paired transfer legs are marked reconciled and excluded from manual mutation; bill/document allocation coverage remains open. |
| Recurring activity | Available | Migration `0016_recurring-scheduler.sql` persists invoice, bill, income, and expense templates with timezone schedules, occurrence claims, run history, and pause/resume/end. Web and Expo management screens exist. Invoice delivery stays `email_not_configured` when no mail provider is configured. The API integration test generates invoices; bill, income, and expense generation use the same scheduler and the existing create use cases. |
| Chart of accounts and journals | Available | Account initialization/write and manual journal CRUD exist with exact values and organisation scoping. General ledger and financial statements are calculated by the reports API from posted journals. |
| Financial reports | Partial | Hono derives trial balance, general ledger, account statement, P&L, balance sheet, cash flow, aging, and tax summary from posted journals, with cash/accrual and comparison. `categoryIds` is accepted and not applied. `baseCurrency` is NZD only, and foreign-currency documents are excluded from GST instead of converted. |
| Tax | Partial | Tax configuration, returns, adjustments, and NZ GST/IRD workflows exceed Akaunting's basic summary in places. Invoice lines can carry multiple taxes. A reusable tax-rate catalogue and compound/withholding tax types are missing. |
| Currencies and localization | Partial | Migration `0015_currency-localization.sql` adds organisation base currency, a precision-aware catalogue, immutable dated rates and localization/financial-year settings. Web and Expo settings use canonical DTOs and have no dedicated component test. Invoices, bills, expenses and explicit-rate base/foreign transfers snapshot exact transaction/base values and fail safely when a reviewed rate is missing. Base-currency report conversion and realized/unrealized exchange journals are not implemented. |
| Company settings | Partial | Business identity, logo, invoice numbering, terms, bank details, template appearance, and default tax rate exist. Currency, locale, and financial year are the currency-settings API. Email templates, reminder schedules, and a notification centre are missing. |
| Companies/organisations | Partial | Organisation create/rename/switch, isolated ledgers, and responsive web/Expo management are implemented and tested. Archive is implemented on `POST /api/organisations/:id/archive` and in both clients, and no automated test calls it. Restore and ownership transfer are not implemented. |
| Users and permissions | Partial | Fixed owner/admin/accountant/member/read-only roles, hashed email-bound invitation accept/revoke/refresh, membership lifecycle, and server-enforced domain permissions are implemented. Custom roles are not implemented. Invitations are share links; outbound invitation email is not sent. |
| Customer portal | Missing | Token-scoped invoice viewing/download is available, but customers cannot authenticate to a portal, manage a profile, list invoices, or review payments. |
| Attachments/uploads | Partial | Organisation-scoped object upload/list/delete exists with the 1 MB SQLite limit. Invoices, bills, and bank transactions link attachments. Items and customer contacts do not. |
| Import/export | Partial | Item, invoice, and vendor CSV preview/apply/export, bill CSV export, and bank transaction import/export exist, including mobile bank CSV preview/import. Customers, accounts, journals, categories, and taxes do not. |
| Search, bulk actions, notifications | Partial | Items have a server bulk activate/deactivate/delete action and a web selection toolbar. There is no cross-domain search and no persistent notification centre. |
| External API and API keys | Missing | The first-party clients use Hono APIs, but there is no customer-facing API-key lifecycle, scoped external API, webhook delivery, or public API documentation. |
| Mobile coverage | Partial | Auth, dashboard, invoices, customers, items, expenses, purchases, bank accounts, manual transactions, transfers, reports, company/team, recurring schedules, and currency settings have Expo screens. Reconciliation, journal administration, the customer portal, and authenticated native-device QA remain open. |

Conclusion: LedgerCraft has a strong sales, expense, NZ tax, and reconciliation foundation, but it does **not** currently contain every Akaunting core feature.

## Core-parity tasks

Tasks are dependency ordered. A task is complete only when its API/domain behavior, web workflow, relevant mobile workflow, organisation isolation, exact-money behavior, migrations, and automated tests pass. New domains follow the existing contract → route → use case → repository → client hook structure.

### AKP-00 — Freeze the parity contract and verification gate (P0)

Expected outcome: the comparison becomes an executable release gate instead of a one-time document.

Status (2026-10-23): **implemented locally.** The versioned manifest at
`docs/akaunting-core-capabilities.json` covers all 25 core comparison rows and
separates 11 optional extensions. Each core row records its contract, API, web,
and relevant mobile evidence or an explicit gap. `pnpm
verify:akaunting-core:report` validates and reports the current inventory
without blocking normal CI; `pnpm verify:akaunting-core` is the strict release
gate and intentionally fails while required capabilities remain partial or
missing. Validator behavior has Node tests. The pinned-SHA review and update
process is documented in `docs/akaunting-parity-gate.md`.

Acceptance criteria:

- Add a machine-readable capability manifest covering every row in the core comparison table.
- Map each capability to its contract, API integration test, web E2E test, and mobile test where applicable.
- Add `pnpm verify:akaunting-core` that fails for unimplemented required capabilities and reports intentionally deferred extension modules separately.
- Pin the Akaunting comparison SHA and document the process for reviewing future upstream changes without automatically expanding scope.

### AKP-01 — Vendors, bills, and accounts payable (P0)

Expected outcome: users can manage supplier obligations from vendor creation through bill settlement, with correct payables and tax accounting.

Status (2026-10-23): **core complete locally.** Migration
`0009_purchase-lifecycle.sql` adds vendor contact/default/import fields and
organisation-scoped bill attachments and immutable history. Hono now validates
cancel/restore transitions, idempotent bill creation, exact split payment
allocations, object ownership, vendor CSV preview/apply/export, and bill export.
The responsive web flow administers the complete lifecycle. Expo applies active
vendor defaults and supports split payments, cancel/restore, attachment capture,
and history. Contract, API, web, and mobile tests pass, as do the web build,
iOS/Android production exports, and an authenticated desktop/390 px browser
flow. Production deployment and authenticated native-device QA remain pending.
Recurring bills are tracked separately in optional extension AKP-04.

Acceptance criteria:

- Add vendor/contact-person records with CRUD, active state, defaults, notes, and import/export identifiers.
- Add bill, bill-line, bill-tax, attachment, status/history, and payment-allocation records using exact decimal TEXT values.
- Support draft, received/open, partial, paid, overdue, cancelled, and restored states with validated transitions.
- Record full and split bill payments against a payment account and update accounts payable atomically.
- Add vendor and bill list/detail/create/edit/payment workflows on web; add vendor/bill read and payment-critical flows on mobile.
- Prove numbering uniqueness, idempotency, rollback, tax-inclusive/exclusive totals, overpayment rejection, and cross-organisation isolation.

### AKP-02 — Complete banking transactions and atomic transfers (P0)

Expected outcome: users can record and manage income, expenses, and transfers without relying on imported statements.

Status (2026-10-23): **implemented locally.** Exact-decimal manual income/
expense writes and idempotent same-currency transfers update balances atomically.
Migration `0010_banking-parity-completion.sql` adds tenant-scoped transaction
splits, document connections, and attachment metadata. Income can be connected
to invoices and expenses to received bills without exceeding either the bank
transaction or remaining document balance. Web supports allocation, SQLite
attachments capped at 1 MB, duplicate, printable/PDF detail, and CSV export.
Expo adds an exact-text CSV parser, native file picker, preview, duplicate
skipping, and statement import. Focused contracts, API, web, and mobile tests,
migration verification, strict mobile TypeScript, and focused lint pass.
Authenticated native-device QA and deployment remain open.

Acceptance criteria:

- Add manual bank transaction create/detail/update/delete with income/expense category, payment method, counterparty, reference, attachment, and reconciliation state.
- Add a first-class transfer that atomically posts equal and opposite entries to two organisation-owned accounts; prevent same-account, cross-currency-without-rate, and cross-organisation transfers.
- Support transaction split allocation and connections to invoices and bills without exceeding document balances.
- Add duplicate, printable/PDF detail, and CSV export workflows.
- Reconciliation excludes or correctly represents paired transfer legs and document allocations.
- Integration tests prove atomic rollback and exact balances under concurrent writes.

### AKP-03 — Multi-company, invitations, roles, and server authorization (P0)

Status: **Partially implemented locally (2026-10-23).** Migration `0008` adds active-company selection, membership removal, and hashed invitations in Identity storage. Hono enforces fixed-role permissions for protected domains, and web/Expo cover company and team administration. Automated proof covers cross-company isolation, direct read-only writes, privilege escalation, wrong-email/stale/reused invitations, and removed membership access. Custom roles, email delivery, deployment, and authenticated native-device QA remain.

Expected outcome: an owner can operate multiple companies and safely collaborate with managers, accountants, employees, and read-only users.

Acceptance criteria:

- Add organisation create/update/archive and active-organisation switching without weakening the one-Durable-Object-per-organisation boundary.
- Add invitation accept/revoke/resend, membership lifecycle, and user administration.
- Define a server-side permission catalogue for customers, invoices, bills, banking, reports, settings, users, and API access.
- Enforce permissions in Hono before every protected use case; UI guards only mirror server decisions.
- Add roles for owner, admin/manager, accountant, employee/member, and read-only, with custom-role support deferred only by an explicit product decision.
- Prove privilege escalation, stale invite, removed membership, direct API access, and cross-organisation attacks fail.

### AKP-04 — Recurring document and transaction scheduler (P0)

Expected outcome: users can schedule recurring invoices, bills, income, and expenses and can trust retries not to create duplicates.

Status (implemented locally 2026-10-23): migration `0016_recurring-scheduler.sql`
and shared contracts persist the four template kinds, interval/timezone/limit
state, deterministic occurrence claims, retry metadata, generated-record links,
and immutable run history. Ledger Durable Object alarms run catch-up without an
external scheduler. Responsive web and Expo expose create, status, run history,
pause/resume, and end workflows. Production email stays unavailable and is
reported as such; deployment and authenticated native-device QA remain pending.

Acceptance criteria:

- Store recurrence templates with daily, weekly, monthly, annual, and custom intervals; start/end/occurrence limits; timezone; next-run state; and pause/end controls.
- Generate normal invoices, bills, or transactions through the same application use cases as manual creation.
- Use deterministic occurrence keys so retries, Worker restarts, and concurrent alarms cannot duplicate a period.
- Record run history, failure reason, next attempt, and generated document links.
- Auto-send only when a mail provider is configured; otherwise create the document and surface an honest delivery status. Implemented with `unavailable` delivery status in the free deployment.
- Verify month-end, leap-year, timezone/DST, catch-up, pause/resume, and idempotent retry behavior.

### AKP-05 — Server-authoritative accounting and reports (P0)

**Implemented locally (2026-10-23), with explicit AKP-06 follow-up.** Canonical
exact-decimal postings, immutable posted journals, tenant-scoped Hono financial
reports, responsive web workflows, and an Expo summary are complete through
migration `0013_server-authoritative-reports.sql`. Date, cash/accrual,
comparison, account/customer/vendor filtering and NZD base currency are
validated. Multi-currency conversion remains AKP-06. Category filtering remains
deferred until category dimensions are stored on journal lines; the query field
is reserved but does not silently fabricate filtered totals.

Expected outcome: invoices, bills, payments, expenses, transfers, and adjustments produce balanced postings, and every report is derived from the same ledger.

Acceptance criteria:

- Define posting rules and transaction boundaries for every money-changing workflow.
- Add general-ledger and account-statement APIs with opening, movement, and closing balances.
- Move P&L, balance sheet, trial balance, cash flow, receivables, payables, and tax summary calculations behind validated Hono contracts.
- Support cash/accrual basis, date range, comparison period, account/category/customer/vendor filters, and base currency.
- Remove production reliance on client-only or stubbed Supabase report branches.
- Golden accounting fixtures prove the accounting equation, debits equal credits, report drill-down totals, void/reversal handling, and period boundaries.

### AKP-06 — Currency, exchange-rate, localization, and financial-year settings (P1)

Expected outcome: multi-currency documents and reports remain mathematically auditable while users see localized dates and amounts.

Implementation note (local, 2026-10-23): migration `0015_currency-localization.sql` implements the settings/catalogue/rate foundation and exact invoice, bill, expense, and base/foreign transfer snapshots. Rate direction is explicitly “base units per one foreign unit”; used rates are immutable and API values remain canonical decimal strings. Cross-currency transfers require the caller to select a persisted reviewed rate and currently require one side to be the organisation base currency. Web and mobile transfer forms do not send that rate id. Realized/unrealized exchange postings and base-currency financial-report conversion are not implemented; reports stay NZD-only and are not synthesized client-side.

Acceptance criteria:

- Add an organisation base currency and managed currency catalogue with precision, symbol, position, enabled state, and explicit dated rates.
- Persist transaction currency, rate, base-currency totals, and realized/unrealized difference postings where applicable.
- Require an explicit reviewed rate when currencies differ; no silent live-rate dependency is introduced.
- Add financial-year start, timezone, date/number formats, language/locale, and percent/discount presentation settings.
- PDFs, exports, dashboards, tax reports, web, and mobile use the same formatting rules while APIs keep canonical decimal strings.
- Tests cover zero/three-decimal currencies, rate direction, rounding, historical rate immutability, and timezone boundaries.

### AKP-07 — Complete invoice lifecycle and document fidelity (P1)

Status (2026-10-23): implemented locally across contracts, Hono/SQLite migration
`0012_invoice-lifecycle.sql`, responsive web, and Expo. The slice includes balanced cancel/restore journals,
policy-based archive, idempotent duplicate, immutable history, exact line
discounts/multiple taxes, private PDF/image attachments with snapshot-scoped
share-token access, CSV dry-run/apply/export, and printable detail. Expo covers
critical lifecycle/history and image attachment actions; web also accepts PDFs
and owns CSV administration. Authenticated native-device QA remains pending.
Recurring invoices remain AKP-04 and production email remains unavailable.
API/contracts/mobile tests, the web production build, strict mobile TypeScript,
iOS/Android production exports, and authenticated responsive browser proof pass.

Expected outcome: LedgerCraft supports the remaining Akaunting invoice-management operations without regressing sharing or PDFs.

Acceptance criteria:

- Add cancel/void, restore, delete/archive policy, and duplicate actions with an immutable status/history trail.
- Add line-level fixed/percent discounts and multiple line tax assignments; authoritative totals remain server-calculated.
- Attach private files to invoices with type/size policy and token-scoped shared-invoice access rules.
- Add import/export and printable detail actions using shared DTOs.
- Preserve existing six templates, snapshot sharing, payment terms, additional charges, bank details, and public PDF behavior.
- Test every state transition, mixed tax/discount rounding, duplicate numbering, attachment authorization, and shared snapshot immutability.

### AKP-08 — Customer contacts, statements, and authenticated portal (P1)

Expected outcome: customers can securely view their own commercial history while businesses manage richer contact records.

Acceptance criteria:

- Add contact people, billing/shipping addresses, tax/currency defaults, active state, and customer notes.
- Add customer statements with opening balance, invoices, credits/adjustments, payments, and running balance.
- Add invitation-based customer identities or a separately scoped portal membership that cannot access admin APIs.
- Portal users can manage their profile and list/view/download their own invoices, statements, and payment receipts.
- Existing public share links remain optional, snapshot-based, revocable/expiring, and independent of portal sessions.
- Authorization tests prove one customer cannot enumerate or access another customer's records.

### AKP-09 — Domain-wide import, export, and bulk actions (P1)

Expected outcome: businesses can migrate into or out of LedgerCraft and manage large lists safely.

Acceptance criteria:

- Add preview/validate/import pipelines for customers, vendors, items, invoices, bills, accounts, journals, categories, taxes, and bank transactions.
- Support stable CSV templates first; add XLSX only if it can be verified within the deployment limits.
- Provide row-level validation errors, duplicate strategy, dry run, resumable/idempotent batches, and an audit summary.
- Export the same domains with canonical IDs and enough references for a lossless round trip.
- Add permission-aware bulk activate/deactivate/archive/delete actions where domain rules permit.
- Round-trip and failure-injection tests prove no partial accounting writes and no cross-organisation references.

### AKP-10 — Configurable dashboards and saved reports (P1)

Expected outcome: users can configure a useful company dashboard and retain report definitions.

**Implemented locally (2026-10-23):** Shared strict DTOs, migration
`0014_configurable-dashboards.sql`, organisation/user-scoped Hono persistence,
AKP-05 server-authoritative report mapping, per-user visibility/order/size/default
layouts, and saved report create/rename/duplicate/pin/archive flows are in place.
Web filters are URL-backed and web provides print, CSV and PDF output. Expo consumes
the same report/filter DTOs, respects the saved widget layout, exposes date presets,
and opens saved filters. Summary, receivable, payable, cash and tax widgets use
the posted-ledger report DTO; recent activity is labelled operational. Expense-
category dimensions and authenticated native-device QA remain open.

Acceptance criteria:

- Add date-filtered receivables, payables, cash flow, P&L, expenses by category, and account-balance widgets backed by server reports.
- Save per-user widget visibility/order/size and default dashboard per organisation.
- Save, rename, duplicate, pin, archive, print/PDF, and export report definitions.
- Report filters survive refresh/shareable URLs on web and have an equivalent saved-filter model on mobile.
- Widget drill-down resolves to the exact transactions making up the displayed total.

### AKP-11 — Settings, email templates, reminders, and notification centre (P1)

Expected outcome: organisation administrators can control defaults and communications, and users can see delivery/job outcomes.

Acceptance criteria:

- Consolidate company, invoice, tax, currency, localization, payment, email-template, and schedule settings behind typed APIs.
- Add versioned invoice/reminder/receipt templates with safe variables, preview, validation, and reset-to-default.
- Add overdue invoice and upcoming bill schedules with quiet hours, timezone, idempotency, and run history.
- Add a persistent in-app notification centre for imports, scheduled work, failed sends, and required user action.
- Preserve the free deployment rule: external email is clearly unavailable unless an explicitly configured provider exists.

### AKP-12 — Search and activity history (P2)

Expected outcome: users can find records across the company and understand material changes.

Acceptance criteria:

- Add organisation-scoped search across customers, vendors, items, invoices, bills, transactions, and accounts with permission filtering.
- Add immutable activity records for status changes, payments, voids, imports, membership changes, and settings changes.
- Expose entity timelines with actor, timestamp, safe summary, and linked source record.
- Never log secrets, session material, raw attachment contents, or full sensitive payloads.

### AKP-13 — Scoped external API, keys, and webhooks (P2)

Expected outcome: approved external systems can integrate without using a human session or receiving broad organisation access.

Acceptance criteria:

- Add hashed API keys with label, scopes, organisation, expiry, last-used time, rotation, and revocation.
- Publish an OpenAPI document from the same Zod/Hono contracts used at runtime.
- Add signed, retryable, idempotent webhook delivery for selected invoice, bill, payment, and customer events.
- Add per-key rate limits, audit logs, secret redaction, and replay protection.
- Keep API keys out of browser/mobile bundles and reject access outside the key's organisation and scopes.

## Optional Akaunting module decisions

These are extensions advertised by Akaunting, not open-source core blockers. Each task begins with a product decision and is implemented only if the decision is **build**. A decision of **exclude** must record the user problem, reason, and alternative; it is not treated as an unnoticed gap.

### AKX-00 — Catalogue and disposition all first-party Akaunting modules (P1)

Expected outcome: there is a versioned list of Akaunting-maintained modules with `already covered`, `build`, `integrate`, or `exclude` decisions, so “all features” has a measurable boundary.

Acceptance criteria:

- Record module name, source URL, user problem, required dependencies, data sensitivity, Cloudflare/free-tier fit, and decision owner.
- Review the catalogue at each Akaunting baseline update.
- Do not treat third-party marketplace availability as a requirement unless a named integration is approved.

### AKX-01 — Two-factor authentication

Expected outcome: users can enroll, verify, recover, and disable TOTP-based 2FA with step-up checks for sensitive operations.

### AKX-02 — Estimates/quotes

Expected outcome: users can draft, send/share, accept/reject/expire, and convert estimates into invoices without re-entering line data.

### AKX-03 — Inventory

Expected outcome: products support SKU, tracked stock, warehouses, variants, adjustments, transfers, reorder signals, and auditable cost/quantity history linked to sales and purchases.

### AKX-04 — Automated bank feeds

Expected outcome: approved NZ-capable provider connections sync transactions idempotently with consent lifecycle, cursor recovery, disconnect/delete controls, and reconciliation provenance. This requires an explicit exception to the current no-external-provider architecture.

### AKX-05 — Employee expense claims

Expected outcome: employees submit receipts and claims through approval, rejection, reimbursement, and accounting posting with role-based visibility.

### AKX-06 — Projects and time tracking

Expected outcome: users manage projects, tasks, assignees, time, billable rates, costs, and invoice/bill links with project profitability reports.

### AKX-07 — CRM

Expected outcome: contacts can progress through lead and opportunity pipelines with activities, ownership, notes, and conversion to customers/invoices.

### AKX-08 — Employees and payroll

Expected outcome: approved jurisdictions support employee records, pay calendars, earnings/deductions, payslips, payroll journals, filings, and strict access controls. Do not claim payroll support before jurisdiction-specific compliance review.

### AKX-09 — Accounting calendar

Expected outcome: users see due dates and scheduled activity for invoices, bills, tax, recurring runs, projects, and payroll, with links to source records and timezone-correct reminders.

### AKX-10 — Payment, commerce, and connector framework

Expected outcome: named payment gateways, e-commerce systems, and business tools can be added through isolated adapters with encrypted credentials, scoped webhooks, idempotent sync, mapping UI, replay, and observable failures. No connector is considered supported until its own end-to-end certification passes.

## Recommended delivery sequence

1. **Foundation gate:** AKP-00.
2. **Accounting completeness:** AKP-01, AKP-02, then AKP-05.
3. **Safe collaboration and automation:** AKP-03 and AKP-04.
4. **Operational parity:** AKP-06 through AKP-11.
5. **Platform capabilities:** AKP-12 and AKP-13.
6. **Extension decisions and approved modules:** AKX-00, then selected AKX tasks.

Do not combine a UI redesign, router migration, repository move, and accounting-domain cutover in the same task. Each task must preserve the deployed Cloudflare architecture unless the user separately approves an architecture change.

## Definition of core parity

Core parity is reached only when:

- every AKP task is complete or has an explicit user-approved exclusion;
- `pnpm verify:akaunting-core`, existing release checks, web E2E, and relevant mobile tests pass;
- production migrations are reviewed and checksum-tracked;
- live authenticated smoke checks cover sales, purchases, banking, reporting, company switching, role restrictions, and the customer portal;
- the comparison is rechecked against the pinned Akaunting baseline and any later baseline change is triaged.
