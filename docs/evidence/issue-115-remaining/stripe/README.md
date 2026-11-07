# Stripe follow-up: verified amounts, refunds and accounting review

Implemented locally 7 November2026 (Pacific/Auckland). This extends the existing
Stripe Phase1 implementation, preserving its Accounts v2 Stripe-responsible
account configuration. It does not claim all acceptance criteria in issue87,
real Stripe account acceptance, live payouts or native-device verification.

## Implemented

- Checkout and PaymentIntent success events now re-retrieve the actual provider
  payment. Stored link amount, currency, organisation/link metadata, destination
  account and application fee must all match before settlement. The signed
  webhook payload supplies identifiers, not monetary authority.
- Two different success event types for one payment create one local settlement.
  Late events cannot re-create a completed settlement. Valid webhook receivers
  remain configured when the new-payment kill switch is off.
- A known application fee posts an exact, balanced merchant-fee/Stripe Clearing
  journal alongside the settlement. No input GST or unprovided Stripe processing
  fee is invented. Actual provider/ledger differences are shown for review.
- Owner/admin balance and payment verification reads return exact provider
  amounts and posted clearing. Verification records match/mismatch audit rows
  and changes no financial amount.
- Owner/admin full refunds require an explicit reason, confirmation and outbound
  idempotency key. The request reverses the destination transfer and application
  fee through Stripe; the invoice/payment changes only after an authoritative
  refund webhook. Existing immutable payment reversal and posting helpers are
  reused. A confirmed returned platform fee reverses its original fee journal. Real
  ApplicationFee events resolve through their charge and PaymentIntent; a fee-only
  refund preserves the customer payment and invoice settlement.
- An invoice with active credit notes cannot initiate this simplified full
  refund: its credit/refund allocation needs separate review before an external
  provider request. Partial provider refunds produce a review record, without
  falsely marking the entire local payment refunded.
- Deauthorisation disables the local account and cancels local open links.
  Public links cannot redirect after cancellation, an uncovered balance change,
  inactive account or expiry. New payment actions remain capability gated.
- Payout/dispute events and captured payments whose invoice balance changed are
  retained in an owner-visible review queue. They do not invent a bank
  destination, dispute-loss policy or customer-credit allocation.
- Web Settings and Expo Settings provide provider balances, settlement/audit
  review, Verify with Stripe and explicit full-refund requests. Exact amounts
  are server-owned. Query owns the loaded server state.

Migration0034 adds persistent opaque rate buckets and per-company verification
scheduling. Real-mode charge links require an explicitly approved company in
`STRIPE_APPROVED_ORGANISATION_IDS`; the empty default denies them. Local mock mode
is allowed only outside production. Web/Expo indicate pending beta approval and
block payment-link actions. Persistent limits cover10 new links per organisation
and actor per minute,60 public redirects per known link per minute, and1,000
verified webhooks per database per minute. Successful idempotent replays bypass
the relevant quota, preserving safe retries.

The daily read-only job discovers the last48h of provider PaymentIntents via
pagination, compares known local settlements, and checks provider versus posted
clearing. It records missing payments, mismatches and incomplete windows rather
than claiming reconciliation or changing money. Provider failures retry no more
than hourly; successful checks schedule24h later. Discovery is bounded at10,000
platform intents and explicitly reports incomplete if that bound is reached.
The parent wires the job and next-alarm function into the existing scheduler.

Migration0032 adds `stripe_verifications` with organisation-bound payment foreign
keys and a timestamped audit record. It was generated with an isolated Drizzle
baseline/delta; only generated Stripe table/index statements were retained.
Other agents' concurrently generated tables were excluded. No applied migration
was altered and no production financial record was rewritten.

## Independent expected versus actual

A separate synthetic non-GST company invoices100 and receives a verified Stripe
payment100. A configured4%+0.30 application fee is4.30. Expected Stripe Clearing
is100−4.30 =95.70. Actual provider and posted clearing both return95.70, difference0.
Verification returns match. A database-tampered local amount90 produces an
amount mismatch and does not silently correct the database.

The full-refund request leaves the local payment completed until its provider
webhook arrives. That webhook changes it to refunded, restores invoice balance100,
and reverses the payment and fee journals once. A replay does not duplicate the
reversal. Provider signature tests use the actual Stripe SDK and HMAC fixture:
current raw-body signature passes; altered body, invalid signature and a
301-second-old signature fail.

Real HTTP tests cover all five roles on the new operational routes, plus a
second company's404. Owner/admin are allowed; accountant/member/read-only are403.

## Local tests

| Command | Node | Actual result |
| --- | --- | --- |
| `pnpm --filter @ledgercraft/api exec vitest run src/modules/stripe --maxWorkers=1` |24.22.1 |7 suites /39 tests passed, exit0 |
| `pnpm --filter @ledgercraft/contracts exec vitest run src/stripe-operations.test.ts` |24.22.1 |1 test passed, exit0 |
| `pnpm exec vitest run src/components/settings/StripeOperationsPanel.test.tsx src/components/settings/StripePaymentsPanel.test.tsx` |22.23.4 |3 suites /9 tests passed, exit0 |
| Mobile `npm test -- --runInBand --watchAll=false src/components/settings/StripeOperationsSection.test.tsx src/components/settings/StripeSettingsSection.test.tsx` |20.20.2 |3 suites /12 tests passed, exit0 |
| Scoped ESLint |22.23.4 |0 errors /0 warnings |

API/mobile full typechecks were attempted during concurrent implementation;
errors were outside the Stripe paths and were sent to their owners. The parent
records the final combined type/lint gates. The initial mobile run retained
query-cache timers after five passing tests; its test QueryClient now has infinite
cache lifetime, avoiding those GC timers. The final scoped mobile rerun exits0 without that teardown warning. No `forceExit`
was used.

The red logs reproduce missing authoritative retrieval/operational endpoints,
stale public payment links, kill-switch receiver removal, and an external refund
that would have failed the existing active-credit reversal guard. The same
financial assertions then pass; assertions were not weakened or skipped.

## Browser verification

The reproducible local-only driver is
`scripts/issue115-stripe-operations-proof.mjs`. It refuses non-loopback origins
and confirms the local simulator onboarding URL before any simulated charge.
It exercises desktop1440×900 and phone390×844 against real Hono/SQLite, captures
balances/verification/pending refund/reloaded refunded state, and asserts the
100/4.30/95.70/0 accounting sequence. **Final web browser execution passed** on production preview build
`b6264eb0537c`, against the frozen API and migrated synthetic SQLite. Both
desktop1440×900 and phone390×844 completed settlement, balance review, Verify,
explicit full-refund request, webhook-only payment reversal and refunded reload.
Actual100/4.30/95.70/0 values matched the working paper and no page errors occurred.
[Eight screenshots, results and browser log](web/) are retained; visual review
covered the phone refund state and desktop balances. A first signup attempt was
rate-limited by parallel local proof runs; the driver then respected the10-second
auth window and retried, with no auth/rate-limit bypass.

Actual Expo web execution also passed in Chromium390×844 using a separate
synthetic company. The More/Settings Stripe panel showed95.70, verification match,
explicit refund pending webhook and a reloaded refunded payment. The API retained
completed status before the webhook, then restored invoice100 and clearing0.
[Four mobile screenshots and results](mobile/) retain the actual capture. No page
errors occurred. Visual review covered balances and refunded state. Native
iOS/Android print, keyboard/background and release acceptance remain unverified.

## Remaining issue87 acceptance

- Real test-account onboarding, 3DS/QR second-device payment, Stripe CLI replay
  and signed native iOS/Android captures need owner access and device setup.
- Payout bank-account mapping, processing-fee evidence/GST treatment, dispute
  recovery/loss policy and posted payout/dispute journals are not invented here.
  Their review notices remain visible until a supported posting workflow ships.
- The full48-hour provider-discovery check has been implemented;
  the local job is now implemented and parent alarm wiring is covered in the combined report. Live provider acceptance remains pending.
- An over-captured payment is retained as a review notice, but automatic split
  allocation to invoice/customer credit/refund remains incomplete. A cancellation
  or manual payment does not synchronously expire an already-open Stripe-hosted
  tab; the public redirect guard cannot recall a URL already obtained by a buyer.
- Partial-refund posting and automatic processing-fee reconciliation remain
  separate work. Beta approval and application rate guards are implemented;
  production edge/WAF protection for unauthenticated signature floods still
  needs deployment configuration. No blanket Phase1-complete claim is made.

No real Stripe request, card charge, refund, payout, legal certification,
production deployment or native module change occurred in this follow-up.


## Issue87 acceptance matrix

“Local” means code plus local tests, not real Stripe or device acceptance.

| Acceptance criterion | Current status |
| --- | --- |
| Global switch hides payment UI and blocks new financial actions | Local; webhook receiving and historical audit records remain available |
| Owner/admin setup, balance and financial actions; other roles403 | Local HTTP role matrix; no Express Dashboard login-link implementation for the existing full-dashboard Accounts v2 model |
| One connected account per organisation | Existing local regression; real concurrency/provider idempotency acceptance remains |
| Incomplete onboarding and authoritative readiness | Local; beta approval is now separately explicit |
| Expired/reused onboarding link refresh | Existing provider URL plumbing; real Stripe acceptance pending |
| NZD/active/not-cancelled/current-balance/minimum link guards | Local |
| Exact input precision/minimum/maximum | Local existing contracts and service guards |
| New link supersedes old link and displays replaced status | **Open code work**; not claimed here |
| Manual payment/cancellation expires links | Partial: public redirects fail closed when uncovered or cancelled; an already-open hosted tab is not synchronously recalled |
|24h expiry and expired status | Existing local implementation; real provider expiry acceptance pending |
| Idempotent link replay and conflicting payload409 | Existing local implementation; new rate budget exempts safe replay |
| One payment/receipt/payment journal/fee journal | Local; Stripe provider identity currently lives in linked payment/receipt records, not dedicated new payment columns |
| Duplicate event and Checkout/PI ordering | Local, exact-once cases |
| Captured excess allocated to balance plus customer credit/refund | **Open code and accounting policy**; retained review notice prevents fabricated invoice overpayment, but is not complete allocation |
| QR paid status within5s | **Open UI acceptance/code review**; this follow-up does not add QR polling |
| Full-refund webhook restores invoice and reverses journals | Local, including independent returned-fee ordering and fee-only events |
| Verify match/mismatch audit without changing money | Local; partial external refunds now explicitly mismatch |
| Clearing reconciles after payment+payout+refund | Partial: payment/full refund exact; payout posting remains open pending destination/policy |
| Raw-body signature, bad/stale rejection | Local actual Stripe SDK HMAC test; live CLI endpoint acceptance pending |
| Destination/org integrity | Local authoritative provider checks; malformed events reject without financial posting |
| Secret/URL/card/contact exposure | Existing scrubbers plus no raw provider payload persistence in new audit rows; final combined security review remains required |
| Daily48h provider discovery | Local pagination/bounded incomplete-warning/read-only audit; parent operational alarm wiring and live acceptance are separate |
| Beta approval and rate limiting | Local allowlist, UI guards and persistent application limits; production ingress/WAF configuration still required |

## Concrete accounting proposal for the remaining money paths

The following is a reviewable design, **not shipped financial behavior**.

1. **Payouts:** require an organisation-owned NZD destination bank mapping and
   retrieve the authoritative payout/balance transaction. A payout95.70 posts
   debit the selected bank95.70 /credit Stripe Clearing95.70, with one bank
   transaction and provider payout identity in the same transaction. It creates
   no revenue or GST. A failed payout reverses that exact posting on the supported
   reversal date. Enforce completed bank cutoffs and provider-id uniqueness.
2. **Processing fees:** retrieve the actual provider balance transaction; never
   apply an advertised percentage. A confirmed2.95 fee posts debit merchant fees
   /credit clearing2.95. Claim GST only from a reviewed supporting tax invoice;
   do not infer GST by dividing a fee. This is separate from the known platform
   application fee already posted here.
3. **Disputes:** record provider financial debits only after determining which
   account bears them under the existing Stripe-responsible account model. Keep
   contested principal in an explicit dispute receivable, with actual fees
   separately evidenced. A win restores clearing against that receivable; a loss
   needs approved write-off and tax treatment. Do not reopen an invoice merely
   because a dispute notification arrived. Recovery, retained fees and bad-debt
   GST treatment need owner/accountant decisions.
4. **Excess capture:** when150 is captured against only100 outstanding, the
   reviewed journal is debit clearing150 /credit receivables100 /credit customer
   credit liability50. This requires a real provider-settlement/customer-credit
   entity and allocation lifecycle; a credit note must not be misused as an
   advance deposit. Decide whether the50 is retained or automatically refunded,
   including fee and advance-payment GST timing, before enabling automation.
   The current notice retains the captured amount and provider identity but does
   not claim that this journal or allocation has been posted.

Each path needs real SQLite financial golden tests, atomic retry/concurrency
coverage, provider re-retrieval, source-linked immutable reversal history and
web/Expo expected-versus-actual acceptance before rollout.
