# Invoice import Phase 1: storage, schema, and deduplication

Phase 1 adds private original-file retention and metadata only. It does not run AI extraction, create invoices or bills, add client UI, or change production storage by itself.

## Data model

- `import_batches` groups 1–10 uploaded files for one organisation and records the creator, status, count, and timestamps.
- `import_documents` records the sanitised display filename, sniffed MIME type, byte/page counts, SHA-256, provider-neutral storage key, upload actor/time, review placeholder fields, direction and third-party issuer metadata, an optional duplicate-document pointer, and an optional committed invoice/bill reference.
- `import_document_events` is the import audit stream for upload, metadata view, download, delete attempts, and discard.
- `invoices` and `bills` gain additive source/import linkage and external-issuer fields. Existing records default to `source='manual'`. Phase 0's invoice `external_number` and locked source-document attachment fields are reused.

The `(organisation_id, sha256)` index is intentionally non-unique. A repeated file is accepted as a new document and the response warns with the existing document ID. All metadata queries remain organisation-scoped.

## Private storage

`FileStorage` provides `put`, `get`, `delete`, and `head` operations. Local Node uses the private filesystem adapter. Workers use the existing Durable Object `_objects` adapter (1 MiB cap) unless an optional `DOCUMENTS` R2 binding exists, in which case the private R2 adapter is selected (10 MiB default and SHA-256 integrity supplied on put).

Keys are `${organisationId}/imports/${uuid}.${extension}` and are checked with `assertKeyOwned`. Downloads always pass through the authenticated API. Discard is soft: the original bytes are retained.

## API

All routes require a Better Auth session and active organisation membership.

| Method | Route | Behaviour |
| --- | --- | --- |
| `POST` | `/api/invoice-imports` | Upload 1–10 base64 JSON files; returns batch, documents, and duplicate warnings. |
| `GET` | `/api/invoice-imports` | List document metadata for the active organisation. |
| `GET` | `/api/invoice-imports/:id` | Read and audit one document's metadata. |
| `GET` | `/api/invoice-imports/:id/file` | Download the private original with `private, no-store` and `nosniff`. |
| `DELETE` | `/api/invoice-imports/:id` | Audit the attempt and soft-discard unless linked to an invoice, bill, or locked source attachment. |

Upload and discard require `invoices.import` (owner, admin, accountant). Member and read-only roles cannot upload or discard. Metadata and file reads use `invoices.read`, so read-only members may view organisation-owned imports. Unknown and cross-organisation IDs return 404.

Uploads validate decoded size before storage, sniff PDF/JPEG/PNG/WebP/HEIC magic bytes, reject declared MIME mismatches, count PDF `/Type /Page` entries best-effort, sanitise filenames, and rate-limit repeated upload attempts per user. API Sentry processing removes request bodies and filename fields.

## Configuration

- `INVOICE_IMPORT_MAX_BYTES`: optional positive integer override. Defaults to the active storage adapter (1 MiB for Durable Object/local storage, 10 MiB for R2).
- `INVOICE_IMPORT_MAX_PAGES`: optional positive integer; defaults to `20`.
- `OBJECT_STORE_DIR`: optional local private storage root.
- `DOCUMENTS`: optional Worker R2 binding. The binding remains commented out in `deploy/api/wrangler.jsonc`.

## Prerequisites before enabling later phases

1. Jeevan creates private production and preview R2 buckets, reviews offshore location/retention requirements, and then uncomments the `DOCUMENTS` placeholder binding with the correct bucket names.
2. Configure `INVOICE_IMPORT_MAX_BYTES` only after R2 is active if a limit different from 10 MiB is required.
3. Add `OPENAI_API_KEY` as a server secret for Phase 2 extraction; never add a value to Git or any client environment.
4. Phase 2 must add the extraction worker/queue or documented fallback, strict structured output validation, and review/commit workflows before any imported accounting record is created.
