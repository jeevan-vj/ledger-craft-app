# Issue #115 money-in/API audit

Audited 7 November 2026 (Pacific/Auckland) against current main `2397140`. Issue
specifications and current GitHub state were read from the public issue pages;
the parent epic's unchecked boxes are not evidence that child work is missing.
No issue state was changed. No production provider call or deployment occurred.

| Issue | GitHub state | Implemented in current code | Remaining code / acceptance gaps |
| --- | --- | --- | --- |
| [105](https://github.com/jeevan-vj/ledger-craft-app/issues/105) Email/AI |OPEN | Worker builds the environment-selected Resend mailer and receipt scanner; invoice/reminder/quote send has real transport and useful public-link content. Health capabilities feed web/mobile honest fallbacks; deployment docs and provider warnings exist. | Real Worker-to-Resend inbox delivery and production receipt recognition remain unverified with this actor. A concrete health mismatch was found and fixed in this PR: a known placeholder key was reported as available even though sending correctly returned unavailable. |
| [87](https://github.com/jeevan-vj/ledger-craft-app/issues/87) Stripe Phase1 |OPEN | Organisation onboarding/readiness; hosted Checkout link creation/cancel; public redirect/QR clients; signed Checkout-success webhook settlement and receipt/ledger posting; local-only simulator. | Not full issue completion: refund, payout/dispute/deauthorisation handling, financial verify runs and related admin balance/dashboard/refund routes are absent. Real test-account onboarding/Checkout/QR/webhook acceptance and owner commercial/go-live decisions remain unverified. |
| [107](https://github.com/jeevan-vj/ledger-craft-app/issues/107) Recurring editor/auto-send |CLOSED | API next-date preview, monthly clamping and Auckland DST handling; auto-send uses the actual invoice mailer; retries reuse the generated invoice; unavailable email is explicit. | Production auto-send acceptance still needs configured-provider evidence; local transport acceptance is not inbox delivery. |
| [108](https://github.com/jeevan-vj/ledger-craft-app/issues/108) Akahu |OPEN | Generic account pre-delete hook infrastructure exists. Existing banking and reconciliation work with CSV/manual sources. | Both Akahu phases are unimplemented: no bank-feeds module, encrypted provider tokens, OAuth/state lifecycle, account sync/revocation hooks or connected-account UI. The transaction source contract still has only import/manual/transfer. Personal credentials, Full App agreement/accreditation and actual mobile build/privacy acceptance require owner access. |
| [109](https://github.com/jeevan-vj/ledger-craft-app/issues/109) Reconciliation |CLOSED | Server suggestions, transaction feed, multi-document invoice/bill matching, fee allocation, personal/transfer flows, matching rules and tenant guards exist. Subsequent accountant fixes protect completed-bank cutoffs and genuine ledger balances. | CSV/local integration coverage exists. Akahu feed acceptance is unavailable until108 is implemented; bank statement cutoffs are not an organisation-wide fiscal-period lock. |
| [110](https://github.com/jeevan-vj/ledger-craft-app/issues/110) Statements/automatic reminders |OPEN | Manual invoice remind and GL-account statements exist. Neither is the requested customer statement/scheduler feature. | Customer open-item/activity statement API, PDF/share/bulk send, sendStatement mailer, offset/template settings, opt-outs, alarm scheduler and reminder log are missing. This is real P2 implementation work, not only a missing email key. |

## Concrete P0 fix made here

The actual Identity Durable Object handles unauthenticated `/api/healthz` before
creating the organisation application. Its email readiness used a non-empty
string check, while the delivery factory explicitly rejects
`your_resend_api_key`. Consequently the same configuration advertised email
available but sending used the unavailable mailer.

`api/src/cloudflare/worker.ts` now uses `createInvoiceMailerFromEnv(env).availability`
for that health value, sharing the existing delivery selection policy. No
provider request is made to compute readiness, and no provider credential is
included in the response. This reports configuration readiness, not delivery.

### Test-first evidence

`node --test scripts/issue-115-worker-health.test.mjs` boots the actual Worker
entry and actual Identity SQLite Durable Object using a temporary local
Wrangler configuration. It omits remote AI bindings and uses only synthetic
settings; no provider call, deployment, real credential or mocked SQL is used.

- Before the fix: placeholder case fails with actual available versus expected
  unavailable. Missing-sender and configured-setting cases pass. Node reports
  two failures counting the failed parent test: [red log](worker-health-red.log).
- After the one-line fix: all four Node test entries pass (three HTTP scenarios
  plus their parent), fail 0/skipped 0, exit 0: [green log](worker-health-green.log).
- Each case also checks health status, unrelated AI/Stripe unavailability, lack
  of credential/sender names in JSON and unchanged `/api/readyz` response.
- Node 24.22.1; API strict TypeScript exits0.

## Existing implementation exercised

Under Node 24.22.1:

```sh
pnpm --filter @ledgercraft/api exec vitest run \
  src/modules/invoices/resend.test.ts \
  src/modules/invoices/email-delivery.e2e.test.ts \
  src/modules/recurring/recurring.delivery.test.ts \
  src/modules/stripe/stripe.integration.test.ts \
  src/modules/reconciliation/bank-reconciliation-phase1.test.ts
```

Actual result: **5 suites /23 tests pass**, exit 0. The email-delivery test uses
real local HTTP at the provider boundary. Stripe integration uses the test
boundary, not Stripe's network or live funds. This is evidence of the described
local implementation, not production or native-device certification.

## Source map for the assessment

- #105: `api/src/cloudflare/worker.ts` (health and Ledger app/alarms),
 `api/src/modules/invoices/{mailer,resend,invoices.service}.ts`,
 `api/src/modules/quotes/quotes.service.ts`,
 `api/src/modules/health/health.routes.ts`,
 `src/services/openaiReceiptService.ts`,
 `mobile/src/services/openaiReceiptService.ts`, `deploy/cloudflare.md` provider
 configuration section, `scripts/provider-secret-readiness.mjs`.
- #87: `api/src/modules/stripe/stripe.routes.ts` current route list;
 `stripe.service.ts` processWebhook/processVerifiedWebhook accepts Checkout
 success and account.updated, with no refund/payout/dispute branches;
 `stripe.gateway.ts` and `stripe.real-gateway.ts`; associated integration tests.
- #107: `api/src/modules/recurring/{recurring.routes,recurring.service,schedule}.ts`
 and `recurring.delivery.test.ts`.
- #108: no `api/src/modules/bank-feeds` or Akahu client exists; only test-hook
 examples refer to Akahu. `packages/contracts/src/bank.ts` source enum excludes feed.
- #109: `api/src/modules/reconciliation/`, `bank-reconciliation-phase1.test.ts`,
 and `docs/evidence/accountant-followup/README.md`.
- #110: `api/src/modules/customers/customers.routes.ts` has no statement endpoint;
 `InvoiceMailer` has no sendStatement; the Worker alarm only runs recurring
 templates, not overdue reminder offsets; no reminder settings/log schema exists.

## Separate deferred reliability finding

The Resend adapter currently uses a provider idempotency key fixed to
`kind/documentId` (`api/src/modules/invoices/resend.ts`). Distinct reminder or
resend payloads within the provider's idempotency window therefore reuse a key.
Current unit tests explicitly expect that constant. This merits a separate
captured regression that models provider idempotency semantics and a durable
per-operation identity design; changing the key to random values alone would
weaken safe retry behavior. No such behavioral change is made in this PR, and
this audit does not claim a live-provider reproduction.
