---
name: ledgercraft-invariants
description: LedgerCraft domain invariants for money, GST, invoice and quote totals, share-token redaction, idempotency, and SQLite migrations. Use before editing those paths or when reviewing a pull request that might touch them.
---

# Domain invariants

Tick every item the diff can affect. A new formula, a second totals helper, or a public page without the referrer policy is a failed review. Details for the commands and the risk label are in `ledgercraft-verify`.

## Money

- Persist money as decimal text. Round at the output boundary with `roundMoney` in `api/src/modules/invoices/money.ts` (`Decimal.toFixed()`, 2 decimal places). That is the cent-precision string. `moneyToCents` is the integer-cent bigint (`Decimal.scaled()`).
- Do not add GST or totals with JavaScript `number`, `Math.round`, or SQLite `REAL`. `parseMoney` is a legacy display conversion only.
- `api/sqlite-migrations/README.md`: never `SUM` money in SQL. Use the decimal helpers.

## Totals

- Stored invoice totals and stored quote totals come from `computeInvoiceTotals` in `api/src/modules/invoices/totals.ts`. Quotes call it from `api/src/modules/quotes/quotes.service.ts`. Do not add a second invoice or quote totals function.
- Pass `taxInclusive` through. The helper defaults it to `true`. Exclusive GST is only when the document says so.
- Bill line GST is `calculateBillLines` in `api/src/modules/purchases/purchases.repository.ts`. Do not reimplement it in the client.
- A preview may show `quantity * rate` as a display fallback. That value is not the stored total.
- Client screens that already inline GST are listed in `.github/CODEOWNERS`. Do not add a new float expression there. A diff in those files is `risk:high`.

## Idempotency

- `Idempotency-Key` is optional. `parseIdempotencyKey` returns undefined when the header is absent, and invoice create, quote create, quote convert, and payment create continue without a record.
- Send the header on retries. When it is present, the scope is organisation, user, method, path, and key, through `api/src/modules/invoices/idempotency.ts`.
- Invoice create, quote create, and payment create hash the request body. The same key and the same body return the stored response. A different body with that key is 409 `IDEMPOTENCY_CONFLICT`.
- Accepted-quote conversion hashes `{}` in `api/src/modules/quotes/quotes.routes.ts`. A different body does not 409 on convert.
- Do not add a second key table. Do not require the header. Clients today omit it. Making the header mandatory is a follow-up, not current behaviour.

## Share tokens and public pages

- Web scrubber: `src/lib/sentry/scrub.ts` redacts `/shared/invoice/`, `/shared/quote/`, and `/api/public/quotes/`.
- Mobile scrubber: `mobile/src/observability/scrub.ts` redacts `shared/(invoice|quote)` and `api/public/(invoices|quotes)`, including `shareToken` query params.
- API scrubber: `api/src/observability/scrub.ts` replaces public invoice and quote URLs with route templates and strips query strings.
- A new public token URL needs all three scrubbers and a test where the raw token is absent from the Sentry event.
- Public document pages call `applyNoReferrerPolicy` from `src/lib/referrerPolicy.ts`, which sets `<meta name="referrer" content="no-referrer">`. Shared invoice and shared quote already do. A new public page must too.

## SQLite migrations

- Add the next number after the highest file in `api/sqlite-migrations/` (`0007_quotes.sql` is the latest today). Never renumber, reorder, or edit an applied file.
- Applied SQL is checksummed. A changed file throws `Applied migration was modified` from `api/src/db/migrate.ts` and from Durable Object startup in `api/src/cloudflare/storage.ts` (`storage.transactionSync`).
- Changes are additive. Do not hand-run SQL inside a request.
- After a new `.sql` file, run `node scripts/generate-sqlite-migrations.mjs` so `deploy/api/migrations.generated.ts` lists it. `pnpm deploy:check` runs that generator. Do not hand-edit checksums.
- `pnpm db:generate` is Drizzle's SQL generator. Review the SQL before it is appended. Do not replay `supabase/migrations/` or `migrations/*.sql`.
