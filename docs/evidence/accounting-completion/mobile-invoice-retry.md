# Mobile invoice payment recovery

The payment sheet now saves its exact request and idempotency key before
transmission, scoped to the authenticated actor and globally unique invoice.
Native uses SecureStore; Expo web uses localStorage through the shared pending
mutation helper. Nothing is sent automatically while offline or after reopening.

Expected versus observed React Native Testing Library checks:

| Scenario | Expected | Observed |
| --- | --- | --- |
| Server commits but client loses the201 response | Reopening after memory reset resumes identical body/key; simulated committed payment count remains1 | Exact |
| Reopened invoice is now paid with balance0 | Saved25 request can be explicitly resumed despite local balance0; it cannot become a new payment | Exact |
| Unknown outcome followed by401 and another remount | Saved key survives; third request uses the original key | Exact |
| Process dies before uncertainty was persisted | Reload upgrades the saved pre-catch attempt to uncertain before a later401 can discard it | Exact |
| A different actor opens the same invoice | Their form has no prior actor's reference/body/key; original actor's pending operation remains isolated | Exact |
| Durable storage fails before first transmission | No payment request is sent | Exact |
| Definitive first400 rejection | User may correct details with a new attempt | Exact |
| Idempotency conflict or later4xx after uncertainty | Preserve the key for review; never mint a replacement that could duplicate cash | Exact |
| Two sheets overlap while a request is still active | Only one request transmits; explicit replay retains the original body/key after completion | Exact |

Invoice Detail surfaces a Resume pending payment action even when its ordinary
Record payment action is hidden for a paid invoice. Saved request fields stay
locked. Actor identity is passed explicitly by both invoice parents and to the
credit-note section; it is not inferred from a DTO that omits its user ID.

Known-success cleanup invalidates stale hydration callbacks. Rehydrating an
actively transmitting request does not race a durable uncertainty write against
its success cleanup. A cold restart still upgrades unacknowledged requests to
uncertain before retry.

Verification on Node20:

```sh
cd mobile
npm test -- --ci --watchAll=false --maxWorkers=2 \
  src/components/invoice/PaymentCaptureModal.test.tsx \
  src/features/payments/paymentModel.test.ts \
  src/features/payments/paymentQueries.test.ts
npm run type-check
npm run lint
```

The affected group passes36 tests across3 suites without `--forceExit`; strict
TypeScript passes and lint reports0 errors/74 warnings. Jest prints the existing
query-timer worker teardown warning. Logs: `/tmp/mobile-invoice-durable-head2-tests.log`,
`/tmp/mobile-invoice-durable-head2-types.log`, and
`/tmp/mobile-invoice-durable-head2-lint.log`.

These are RNTL integration checks with a persistent SecureStore mock, not a claim
of signed-device or live-bank verification. Full Expo/browser and native device
results are recorded separately by the overall verification report.
