# Independent local review — remaining issue #115 flows

Base `d56bb6b`, branch `codex/issue-115-remaining-flows`. Issue #114 remains
parked. This document reviews the remaining-flow change separately from the
earlier GST slice. The reviewer has authored no production implementation in
this change and has not pushed, approved, labelled or merged it.

## Current verdict

**INITIAL INDEPENDENT REVIEW: CHANGES REQUESTED.** Builder fixes are verified in
the resolution addendum; final independent re-review remains pending.

Source review identified four concrete defects, reported to the implementation
owners for authentic regression tests and fixes:

1. `src/pages/Customers.tsx`: both customer layouts put two sibling links inside
   one `Button asChild`. Radix Slot requires one child; rendering any populated
   customer list can throw `React.Children.only`. Render both desktop and phone
   populated lists after correcting the action structure.
2. `api/src/modules/bank-feeds/bank-feeds.service.ts`: scheduled sync binds the
   configured company, but delegates each import to
   `importBankTransactionsForUser`, which selects the owner's current active
   company again. Switching to company B prevents a company A feed transaction
   from importing. The existing switched-company test uses an empty account
   list, so does not exercise this path. Add a real provider transaction to that
   case and retain the configured company during import.
3. `api/src/modules/stripe/stripe.webhooks.ts`: an
   `application_fee.refunded` payload is an ApplicationFee with `charge`, not
   `payment_intent`. Reading the latter rejects real delayed fee-refund events,
   leaving a previously unreturned fee without its confirmed reversal. Resolve
   the authoritative charge/payment from the fee, and test the real payload
   shape plus duplicate delivery.
4. `api/src/modules/recurring/recurring.service.ts`: execution retains a
   template's company ID but calls user-facing create functions using its
   creator ID. Those functions reselect the creator's active company. A
   no-contact expense can be created in company B after its company A creator
   switches companies; invoices normally fail when their company A customer is
   absent from B. Although inherited scheduler logic, the new recurring
   workflow relies on it. Execute with an explicitly verified template-company
   context and test a real occurrence after switching companies.

The customer action structure is now corrected. The bound Akahu import and
ApplicationFee lookup / independent fee-only reversal fixes have been reviewed.
An independent rerun passed four files / 32 tests, exit 0
(`/tmp/issue115-remaining-independent-provider-fixes.log`), including a real
nonempty switched-company feed case and the authentic ApplicationFee object
shape. This uses mocked provider contracts and real SQLite/domain services;
it does not establish live-provider acceptance.

The initial independent scoped run recorded 32 passes / one failure, with the
new Akahu switched-company transaction reproducing `Bank account not found`
(`/tmp/issue115-remaining-independent-scoped-initial.log`). At the recurring
owner's request, this reviewer added only
`api/src/modules/recurring/recurring-organisation-scope.test.ts`. All seven
cases failed before the fix, exit 1
(`/tmp/issue115-remaining-recurring-scope-red.log`): four payload kinds and
removed/demoted/archived execution contexts. The builder must review these
reviewer-authored regression tests; this reviewer has authored no production
changes. The recurring fix remains pending.
The reports owner independently found a cash P&L recognition bug and is fixing
it; its final source and evidence are not yet reviewed here.

## Checks in progress

- Customer statements trace dated receivable/customer-credit journal movements,
  preserve historical reversals, retain immutable public snapshots and support
  explicit revocation/expiry. Historical aging derives dated control movements
  rather than today's payment state.
- Scheduled reminder steps are claimed before external I/O and retain stable
  provider delivery keys, fresh outstanding-balance/opt-out checks, and bounded
  skipped/failed/uncertain state. Separate operational jobs use settled promises
  so one provider failure cannot starve the others.
- Statement tokens are hashed at rest; the public page sets no-referrer policy,
  and API/web/mobile scrubbers cover the new token routes.
- Akahu secrets remain server-side; configured owner/company checks guard
  writes, provider amounts retain exact JSON lexemes, duplicate provider IDs
  are checked against immutable imported values, and revocation precedes
  account metadata deletion. Full App OAuth is explicitly unavailable.
- Stripe settlement retrieves authoritative payment facts and validates amount,
  currency, organisation, destination, link and fee before posting. Partial
  refunds and uncertain payout/dispute policy produce review records rather
  than fabricated financial allocations.
- Receipt scanning proposes exact decimal text; review saves pending expenses,
  private objects remain company-scoped, browser drafts are keyed by user and
  company, duplicate warnings are explicit and save retries use persisted
  idempotency identities. PDF extraction retains bounded/untrusted-document
  handling. These checks do not establish actual provider or native acceptance.

Initial production hashes are saved in
`/tmp/issue115-remaining-reviewed-production-hashes-initial.json` for final delta
review. Full API/contracts/web/mobile, types/lint, build/readiness, browser/PDF
evidence and final hashes are pending; scoped results are not a combined pass.

## Risk and limits

Risk is **high**: financial postings, migrations, permissions, provider webhooks,
private storage and background execution are affected. Auto-merge is not
eligible; human CODEOWNERS review and merge are required. This is a local review,
not external PR approval. No real email recipients, bank/provider funds,
deployment, installed iOS/Android operation or IRD filing are claimed.

## Builder resolution and verification after interruption

The independent initial findings above are retained as findings, not final
approval. The customer action structure, nonempty switched-company Akahu import,
real ApplicationFee shape and recurring actor/company scope were fixed and
re-verified. Independent provider re-verification passed32 tests, and the
independent cash/domain run passed15 tests.

The reviewer additionally identified an accepted-delivery race before the
interruption. Two real in-flight cancellation/edit tests failed before the
builder fix. Completion now compares the current invoice snapshot before any
status/posting write; both variants return409, preserve the newer lifecycle and
amounts, and create no new receivable. The schema keeps cancellation in
lifecycleStatus, so the reproducer asserts cancelled lifecycle plus the original
stored draft status. Four delivery suites/10 tests pass, including existing
manual/recurring delivery acceptance.

The last actual mobile CSV/FX run exposed a separate displayed bank-balance bug.
Two real SQLite tests failed before the import balance/direction fixes; four
bank/feed/reconciliation suites/21 tests pass afterwards. The complete Expo
workflow then passed with906.03 + imported12.10 − transfer16.00 =902.13 and
USD10.00, while duplicate import adds no second movement.

Final local gate results belong in the central README and checks directory.
This builder addendum is **not independent final approval**. The independent
reviewer's final re-review was interrupted; high-risk human review and remote
CI remain required. No approval, auto-merge eligibility, deployment, real
provider acceptance or installed-device pass is claimed.
