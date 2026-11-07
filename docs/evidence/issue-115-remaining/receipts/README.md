# Receipt capture (#113)

Implemented locally on 7 November 2026. This feature prepares reviewed expenses;
it does not infer GST eligibility or automatically post a scanned suggestion.

## Behavior and expected results

The web Expenses page has a batch receipts inbox. Three images and one PDF are
uploaded independently, then scanned only when the actual server capability is
available. States are uploading, scanning, needs review, saved and failed. An
unavailable provider causes manual review with the same uploaded file, with no
scan request or 503 toast. A failed scan retains the upload and offers retry or
manual entry. The batch processing model covers all four file types and state
transitions. Receipt drafts are **browser/company/user-scoped**, not a server
inbox: reload resumes retained uploads and review data on that browser. Saving a
pending expense makes it available across devices. Interrupted uploads require
the original file again; completed uploads can be reopened for retry.

A source total115.00 and GST15.00 stay exact editable decimal strings. Explicit
review and Save creates one pending expense with amount115.00, tax15.00, the
original receipt URL and SHA256 identity. Nothing is approved or posted by AI.
Matching existing categories prefill from the suggestion; unknown category
suggestions are displayed without silently creating a category. The form
requires an explicit GST treatment. Partial/private-use treatment is
reviewed in the existing full expense form before approval.

SHA256 or matching vendor/date/gross warns about duplicates and requires explicit
override, rather than silently dropping legitimate duplicates. The nullable
`receipt_hash` field is added by migration0031; changing/removing an attachment
clears a stale digest. The object upload returns a server-computed digest. Receipt-only upload/delete
routes require the actual bills.write permission and fix the prior accountant
upload block without widening generic object writes. Kind, company ownership
and receipt-directory guards remain enforced; read-only upload is403. Deleting
a receipt retained by an expense, invoice, bill or bank transaction returns409,
including after a save response was lost.
Expense create accepts the existing optional Idempotency-Key protocol: retrying
the same reviewed request returns the original expense; a changed body with the
same key returns409. This is separate from an explicitly acknowledged duplicate.
The server rejects GST greater than the gross receipt amount with422.

PDF receipt input reuses the invoice-import extraction path. Text PDFs reach
remote providers as bounded untrusted text, never as a PDF image_url. Workers AI
PDF conversion reuses the existing toMarkdown path, page cap, metadata exclusion
and boundary sanitization. An unreadable PDF remains attached for manual entry;
malformed PDF encoding is a correctable422. No real provider was contacted.

Modern clients opt in with `exactAmounts:true`. Canonical scanned proposals use
exact monetary strings. The route retains numeric output for old installed
clients that omit the flag, so existing `.toFixed()` consumers remain compatible.
This conversion is only a legacy response boundary; it does not calculate or
persist financial totals.

Mobile camera/library selection reuses the existing bounded JPEG prepare path,
uploads first and automatically scans when available. Expo web uses a bounded JPEG-base64 adapter because native filesystem methods
are unavailable in a browser; native iOS/Android retain the existing prepare path.
The unavailable and failed paths preserve the uploaded attachment and offer manual entry. Reviewed receipt
total and GST are editable separately. Source gross115/GST15 yields expense115,
not132.25: the prior form treated scanned gross as net and applied GST a second
time. Duplicate warnings require explicit acknowledgement. Private receipts are
opened through authenticated API transport and an image preview or PDF file
share, instead of sending a protected URL to an unauthenticated external browser.
No native module, dependency or runtime fingerprint was changed.

## Verification

Test-first logs are retained alongside this document. They include the original
PDF-image_url behavior, numeric money schema, missing inbox, unavailable camera
fallback, double-GST form behavior, missing duplicate warning, missing uploaded
digest, unsafe expense replay and stale attachment digest / GST>gross guards.

| Check | Node | Actual local result |
| --- | --- | --- |
| Receipt provider/PDF/HTTP/expense/object API tests |24 | 5 files /15 tests passed |
| Receipt/AI/expense/object contracts |24 |4 files /9 tests passed |
| Web inbox and existing expense/upload forms |22 |5 files /30 tests passed |
| Final web inbox model/component rerun |22 |3 files /6 tests passed |
| Mobile capture/preview/forms/duplicate checks |20 |6 suites /10 tests passed |
| Scoped web/API ESLint |22 |0 errors |
| Mobile TypeScript/scoped ESLint |20 |TypeScript exit0; scoped lint0 errors /4 existing warnings |

Legacy Expenses CRUD fixtures now provide the required auth context and
isolate the inbox, while the dedicated page-permission/inbox tests cover the
new boundary. All10 original CRUD tests and13 combined fixture/boundary cases
pass with their original financial and mutation assertions retained.

The parent evidence report contains complete product-suite checks and release
compilation rather than claiming these scoped checks constitute all CI jobs.

## UI evidence

Actual authenticated browser proof uses `scripts/issue115-receipts-proof.mjs`
with real local Hono/SQLite and object storage. It checks3images+PDF uploads,
reload of review drafts, no save before review, actual115/GST15 pending expense,
original uploaded bytes and an explicit duplicate override. Desktop1440×900 and phone390×844 runs **passed** on production build
`b6264eb0537c`, with6 screenshots and exact saved-record assertions in
[web/results.json](web/results.json). No browser page errors occurred. The first
parallel proof hit the legitimate signup rate limit; a bounded11-second retry
(max4 attempts) respects that limit without changing auth policy.

The actual Expo-web390×844 flow also **passed**, using the real browser file
picker, bounded JPEG processing, receipt-only API upload, unavailable-AI manual
fallback, explicit115/GST15 pending save, reload into expense edit, and an
authenticated private image preview. Four screenshots and the source identity
are in [mobile/results.json](mobile/results.json). The final preview capture
waits for the modal slide to settle inside the viewport; no app behavior was
changed to obtain that screenshot. A first exact accessible-name selector
included a decorative icon; the driver uses the visible action label.

Visual review covered web desktop saved state, phone duplicate review and
the Expo uploaded-photo fallback plus settled authenticated image preview. The provider-unavailable case is labelled honestly; batch scan availability and failed-provider states
are tested with local deterministic doubles, not live model acceptance.

Installed iOS/Android camera permissions, secure image/PDF preview, native file
sharing, keyboard/background/resume and real provider accuracy remain named
device/production acceptance checks. No email, IRD submission, production data
change, deployment or store release occurred.
