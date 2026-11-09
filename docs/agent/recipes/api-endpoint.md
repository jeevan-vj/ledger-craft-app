# Recipe: API endpoint

Use one existing endpoint as the pattern. `POST /api/payments` is the reference. Routes are mounted from `api/src/app.ts` with both `''` and `/api` prefixes. Clients call `/api/...`.

1. Add or extend the Zod contract in `packages/contracts`. Export it from `packages/contracts/src/index.ts`. Add a contract test that rejects the bad payload and accepts the valid one.
2. Parse the body with that schema inside the route (`api/src/modules/payments/payments.routes.ts`). Return the standard error shape `{ error: { code, message, requestId } }`.
3. Call `requireSession`. Pass the session user into the service. The service uses `withOrganisationTx` in `api/src/modules/auth/bind-organisation.ts`. Do not read `organisation_id` or `user_id` from the body.
4. Keep the transaction and the repository write in the service (`payments.service.ts`, `payments.repository.ts`). Do not post a journal from the route and again from the repository.
5. Idempotency, when the route already has it, goes through `api/src/modules/invoices/idempotency.ts`. `POST /api/payments` treats `Idempotency-Key` as optional. `POST /api/sales` requires it. Do not add a second key table.
6. Money stays on `roundMoney` and `computeInvoiceTotals`. Bill GST stays on `calculateBillLines`. Link those helpers. Do not paste a second formula.
7. Focused tests: `pnpm test:contracts -- src/payment.test.ts` and `pnpm test:api -- src/modules/payments/payments.test.ts` on Node 24. Assert the amount, status, and tenant boundary. Then run the API job in `ledgercraft-verify` once for the head.
8. A migration stops for explicit approval. The next number comes from listing `api/sqlite-migrations/`, then `api/sqlite-migrations/README.md`. Do not edit an applied file.

Escalate instead of inventing behaviour when the change touches posting, GST, auth, or a period lock. The risk list is `docs/PIPELINE.md`.
