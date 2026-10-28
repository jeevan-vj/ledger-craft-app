# Invoice import Phase 2: extraction, review, and draft commit

Phase 2 adds API and shared-contract support for extracting retained Phase 1 files, reviewing a typed draft, and committing a draft invoice or bill. It does not add web/mobile UI, send or post documents, create payments, or publish journal entries.

## Provider selection

The server chooses providers in this order:

1. OpenAI when `OPENAI_API_KEY` is set.
2. xAI when `XAI_API_KEY` is set and OpenAI is not configured.
3. Cloudflare Workers AI when the `AI` binding is present.
4. The deterministic mock in `development`, `test`, or `demo`, or when `INVOICE_IMPORT_AI_PROVIDER=mock` is explicitly set outside production.

`INVOICE_IMPORT_AI_PROVIDER` can explicitly select `openai`, `xai`, `workers-ai`, or `mock`; a named but unconfigured provider returns `503 EXTRACTION_PROVIDER_UNAVAILABLE`. Production refuses the mock even when configured. With no production provider, extraction returns 503. Provider credentials and bindings remain server-only. Tests inject providers and never call a live AI API.

OpenAI and xAI receive a strict structured-output schema. Image files are sent as base64 data URLs. PDF text is extracted best-effort from uncompressed text streams, length-limited, and wrapped in `BEGIN_UNTRUSTED_DOCUMENT` / `END_UNTRUSTED_DOCUMENT` delimiters. The system instruction treats all document text as data and ignores instructions inside it.

Workers AI uses `@cf/meta/llama-4-scout-17b-16e-instruct` (no licence step) unless `WORKERS_AI_MODEL` overrides it; a model-licence error (5016) returns 503. It retries invalid JSON/schema output once, caps confidence at 0.6, and marks every non-missing field for review. For PDFs, the binding's native `toMarkdown` conversion runs with metadata disabled only after the page cap is known: an unreadable page count is `400 TOO_MANY_PAGES` and does not call the binding. The server strips control characters and `BEGIN_UNTRUSTED_DOCUMENT` / `END_UNTRUSTED_DOCUMENT` marker strings (including spaced, hyphenated, and zero-width close variants), caps the converted document at 30,000 characters, and wraps the remainder in one pair of those delimiters before extraction. A missing PDF-conversion binding returns 503. A thrown binding error maps through the existing Workers AI helper (429 for the daily limit, 502 otherwise) and does not include the provider's own message. An unreadable conversion returns 502. Images continue to use base64 data URLs. `WORKERS_AI_FAKE=1` supplies synthetic local demo data, including `toMarkdown`, only outside production.

## Validation and storage

`0019_invoice-import-phase2.sql` adds provider/mock labels, validation issues, contact review state, extraction/review timestamps, and the committed invoice's third-party-issued flag. Draft JSON remains on `import_documents`; it is never accepted as an organisation id, user id, final direction, or status.

Line amounts, net, GST, and total are recomputed server-side with integer/rational arithmetic and half-up cent rounding. Provider amounts may differ by at most one cent. A larger difference records a blocking `totals_mismatch` or `line_amount_mismatch`. The prompt-injection fixture deliberately returns a provider total of zero; the server recomputes `115.00`, reports the mismatch, and refuses commit until PATCH supplies the reviewed value.

Sentry processing drops document text, extraction drafts, line confidence payloads, filenames, and request bodies. Audit events record only safe metadata such as provider name, mock status, edited field names, issue count, and committed record ids.

## Routes

All routes bind the active organisation from the Better Auth membership. Cross-organisation ids return 404.

| Method | Route | Permission | Behaviour |
| --- | --- | --- | --- |
| `POST` | `/api/invoice-imports/:id/extract` | `invoices.import` | Rate-limited extraction; stores the strict draft and validation issues; status becomes `needs_review`; audits `extracted`. |
| `GET` | `/api/invoice-imports/:id/draft` | `invoices.read` | Returns draft, confidence, provider/mock label, validation issues, hash/issuer duplicate warnings, and customer/vendor match suggestions. |
| `PATCH` | `/api/invoice-imports/:id/draft` | `invoices.import` | Edits reviewable fields, sets the explicit `SALES`/`PURCHASE` decision, third-party-issued state, and contact; revalidates; audits `reviewed`. |
| `POST` | `/api/invoice-imports/:id/commit` | `invoices.import` | Requires direction, resolved validation, selected contact, and duplicate acknowledgement; atomically creates and links one draft record; audits `committed`. |

Commit returns `422 DIRECTION_REQUIRED` without an explicit decision, `422 TOTALS_MISMATCH` while blocking validation remains, `409 DUPLICATE_WARNING` until `{ "acknowledgeDuplicates": true }`, and `409 IMPORT_ALREADY_COMMITTED` on a second commit.

`SALES` uses the selected customer and creates a draft invoice with `source='import'`, external issuer/number, import id, and third-party-issued state. `PURCHASE` uses the selected vendor and creates a draft bill with the equivalent import metadata. Both attach the retained original as `role='source_document'`, `locked=true`. They remain unpaid, unsent, and unposted, with no journal entries. The existing import DELETE and attachment DELETE routes return 409 after linkage.

## Duplicate and contact review

Warnings cover the same SHA-256, issuer plus document number, and issuer plus issue date plus total across imports, invoices, and bills. Warnings do not auto-select a record and require an explicit commit acknowledgement.

For suggested or selected `SALES`, customer names are compared with the extracted issuer. For `PURCHASE`, vendors are matched by GST number first and then name. The reviewer must submit `contactId`; the server verifies it through the invoice or bill domain repository during commit.

## Configuration and prerequisites

- `OPENAI_API_KEY`: primary server-side provider secret.
- `XAI_API_KEY`: optional server-side fallback secret.
- `AI`: Cloudflare Workers AI binding used after OpenAI and xAI.
- `WORKERS_AI_MODEL`: optional Workers AI model override.
- `INVOICE_IMPORT_AI_PROVIDER`: optional explicit provider override.
- `INVOICE_IMPORT_AI_PROVIDER=mock`: local/demo opt-in only; rejected in production.
- Phase 1 private file storage must be available. Before raising the 1 MiB default, enable and review the private `DOCUMENTS` R2 binding described in `phase1.md`.
- Production must supply at least one remote provider key or the Workers AI binding before extraction is enabled.

Deterministic test fixtures are generated by `node api/scripts/generate-invoice-import-fixtures.mjs` and committed under `api/src/modules/invoice-imports/__fixtures__/`.

