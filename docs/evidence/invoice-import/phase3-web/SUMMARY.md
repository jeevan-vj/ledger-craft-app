# Invoice import Phase 3a web evidence (issue #94)

Captured locally on 2026-10-26 at 1440×900 with Playwright Chromium against a fresh temporary SQLite database. The harness started the Hono API with `APP_ENV=demo`, explicitly unset OpenAI and xAI keys, and used the deterministic mock extractor. All accounts, contacts, documents, and business details are synthetic demo data.

## Screenshots

1. [`01-upload-empty.png`](01-upload-empty.png) — An authenticated owner can open the import route; the empty picker accepts PDF, JPG, and PNG and does not preselect Sales or Purchase.
2. [`02-upload-drag.png`](02-upload-drag.png) — A real `DataTransfer` `dragenter` event activates the visible drag-over state on the drop zone.
3. [`03-processing.png`](03-processing.png) — The extract request was deliberately delayed in the browser, proving the upload/extract step indicator while server processing is in flight.
4. [`04-review-original-beside-fields.png`](04-review-original-beside-fields.png) — The authorised original-file request is rendered through a blob URL in the Chromium PDF viewer beside extracted fields; the mock badge and suggestion-only Sales text are visible while direction remains unselected.
5. [`05-direction-third-party-warning.png`](05-direction-third-party-warning.png) — Selecting Sales with the buyer-created toggle on shows the Cleancorp / Crystal Touch Cleaning third-party issuer warning and retains the external-number explanation.
6. [`06-low-confidence-photo.png`](06-low-confidence-photo.png) — The JPG follows the image-preview path and visibly flags lower-confidence fields with amber outlines, scores, and “Check this” badges.
7. [`07-duplicate-warning.png`](07-duplicate-warning.png) — Re-uploading the committed Cleancorp source, choosing Sales, and selecting Cleancorp shows both duplicate reasons; with every other requirement complete, the unchecked acknowledgement alone keeps Create draft invoice disabled.
8. [`08-totals-mismatch-block.png`](08-totals-mismatch-block.png) — After choosing Purchase and Sparkle Supplies, the prompt-injection fixture shows server-recomputed line/GST values beside its stated total; with every other requirement complete, the blocking red mismatch alone keeps Create draft bill disabled.
9. [`09-committed-draft-invoice.png`](09-committed-draft-invoice.png) — The reviewed Cleancorp import committed through Hono and navigated to the persisted draft invoice; the success toast states that the original is attached and locked.
10. [`10-invoice-source-link.png`](10-invoice-source-link.png) — The persisted invoice detail exposes its Source document card, external issuer/number provenance, and authorised Download original action.
11. [`11-bill-committed.png`](11-bill-committed.png) — The Sparkle Supplies review committed as Purchase and navigated to the persisted draft-bill edit page with vendor, external reference, dates, line, quantity, price, and GST loaded.
12. [`12-read-only-denied.png`](12-read-only-denied.png) — A separately signed-up user who accepted an API-created `read_only` invitation sees the explicit import-permission denied state.

Every PNG is 1440×900 and below 300 KB. The harness validates those dimensions and byte limits, stops both local servers, removes its temporary database/object store, and removes Vite’s generated timestamp module on exit.

## Boundaries

- Verified locally: Better Auth sessions, organisation membership/permission handling, Vite-to-Hono proxying, upload/extract/draft review, authorised original-file blob loading, mock-labelled extraction, duplicate and totals blocks, invoice and bill draft commits, reloadable provenance on the invoice, and persisted bill fields.
- Not verified: real OpenAI or xAI extraction, remote/production databases, Cloudflare deployment, production object storage, outbound email, posting/journals, payment, native mobile, or any hosted environment.
- The PDF and JPG fixtures are intentionally tiny synthetic documents. Chromium rendered the PDF viewer after its asynchronous paint; no real customer document was used.
