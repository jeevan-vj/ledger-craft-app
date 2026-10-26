# Invoice import (#94): final acceptance table

Status as of 26 Oct 2026 (NZDT). This covers the stacked draft PRs #95 → #96 → #97 → #98 → #99 → #100 (Phase 4, this PR). Nothing has been merged, deployed, or applied to any remote database. All evidence is local: fresh temporary SQLite databases, `APP_ENV=demo`, no AI keys, synthetic demo data (org "Crystal Touch Cleaning", customer "Cleancorp Ltd", vendor "Sparkle Supplies Ltd").

Legend: **PASS** = proven locally by a test or demo listed. **PARTIAL** = works, with a stated gap. **NOT DONE** = not built. **BLOCKED** = needs a decision, credential, or infrastructure from Jeevan.

Evidence paths are relative to `docs/evidence/invoice-import/`.

## Accounting and GST (Phase 4)

| # | Requirement | Status | PR | Evidence |
|---|---|---|---|---|
| A1 | Cleancorp third-party-issued doc (200 + 30 = 230) commits as a Crystal Touch **sales draft invoice**, with no journal at draft | PASS | #97, #100 | `phase4/local-api-demo.txt` §1, `invoice-imports-accounting.e2e.test.ts` |
| A2 | After the normal issue step the journal is Dr 1200 AR 230.00 / Cr 4000 Sales 200.00 / Cr 2200 GST 30.00 | PASS | #100 | `phase4/local-api-demo.txt` §1 |
| A3 | Supplier bill (100 + 15 = 115) commits as a **draft bill**, no journal; after receive: Dr 5000 100.00 / Dr 2150 15.00 / Cr 2100 115.00 | PASS | #97, #100 | `phase4/local-api-demo.txt` §2 |
| A4 | GST report (invoice basis): output 30.00, input 15.00, net 15.00 payable | PASS | #100 | `phase4/local-api-demo.txt` §3 |
| A5 | Trial balance balanced after both postings | PASS | #100 | `phase4/local-api-demo.txt` §4 |
| A6 | Wrong direction: the Cleancorp doc cannot be committed as a purchase without an explicit user decision | PASS | #97, #100 | `phase4/local-api-demo.txt` §5. A suggestion-only commit returns 422; only an explicit `direction=PURCHASE` PATCH commits it as a bill (still a draft). An override of the suggestion has no extra "are you sure" confirmation. |
| A7 | Imported "paid" status creates a real payment and a Bank/AR journal (never sets balance due to 0 by itself) | PASS | #95, #100 | CSV import `paid` → real payment, Dr 1110 Bank 230 / Cr 1200 AR 230 (`phase0/local-api-demo.txt`). The AI document import has no paid flag: the commit stays unpaid, and the normal payments route posts Dr 1110 / Cr 1200 230.00 (`phase4/local-api-demo.txt` §6). |
| A8 | `read_only` denied on import and on the issue/receive (approve) step | PASS | #95, #97, #100 | `phase4/local-api-demo.txt` §7 |
| A9 | "Record as issued" as a separate no-email action for third-party-issued sales | NOT DONE | — | The posting step today is the normal `POST /api/invoices/:id/send` (status `sent`). The tests use a no-op mailer. There is no dedicated "record as issued" action without email. |
| A10 | Payments-basis orgs see import GST in the invoice period (existing gap, decision 12) | NOT DONE | — | Existing reports engine behaviour; called out in issue §5.10 |

## Security items

| # | Requirement | Status | PR | Evidence |
|---|---|---|---|---|
| S1 | File validation by magic bytes (a text file named `.pdf` → 415) | PASS | #96 | `phase1/local-api-demo.txt` |
| S2 | Size cap (413 `FILE_TOO_LARGE`) and PDF page cap (20, `TOO_MANY_PAGES`) | PARTIAL | #96 | `phase1/local-api-demo.txt`. Without R2 the cap is 1 MB; the 10 MB cap only applies once R2 is bound. Encrypted PDFs are not rejected yet. |
| S3 | Org isolation and IDOR: org B gets 404 on org A's import, file, extract, patch and commit | PASS | #96, #97 | `phase1/local-api-demo.txt`, `phase2/local-api-demo.txt` §9 |
| S4 | Authorised downloads: session + org + permission check, `private, no-store`, `nosniff`, SHA-256 verified | PASS | #96 | `phase1/local-api-demo.txt`. Files are streamed through the API, not by signed URL. No sandboxing CSP header on PDF responses yet. |
| S5 | Audit log of upload, extract, review, commit, view/download and delete attempts | PASS | #96, #97 | `phase1/…` (uploaded/file_downloaded/delete_attempted), `phase2/…` §11 |
| S6 | Rate limiting on upload and extraction (429 `RATE_LIMITED`) | PARTIAL | #96, #97 | In-memory per isolate. Not durable across Worker isolates or restarts. |
| S7 | Sentry scrubbing of filenames and document text | PASS | #96, #97 | `api/src/observability/scrub.test.ts` (unit test only; no live Sentry event checked) |
| S8 | The original can't be deleted while a record links to it (409 `IMPORT_DOCUMENT_LINKED` / `SOURCE_DOCUMENT_LOCKED`) | PASS | #95, #96, #97 | `phase0/…`, `phase1/…`, `phase2/…` §4 |
| S9 | Public share links do not expose the source document | PASS | #95 | `api/src/modules/invoices/share.ts` skips `source_document` (unit-tested; not screenshot-proven) |
| S10 | Phase 0: permission gap on `invoices-import` and CSV exports closed; CSV formula injection neutralised | PASS | #95 | `phase0/SUMMARY.md` |
| S11 | `read_only`/`member` get 403 on **every** import route | PARTIAL | #96, #97 | Write routes return 403. `read_only` can still GET the draft and download the original (view rules), which differs from issue §6. |

## Product requirements

| # | Requirement | Status | PR | Evidence |
|---|---|---|---|---|
| P1 | Direction decision required (422 `DIRECTION_REQUIRED`); the AI only suggests | PASS | #97, #98, #99, #100 | `phase2/…` §2, `phase3-web/05-…png`, `phase3-mobile/05-…png` |
| P2 | Third-party-issued flag and warning panel | PARTIAL | #97, #98, #99 | Flag stored and warning shown. The full IRD checklist with saved `third_party_ack` answers is not built. |
| P3 | Duplicate check: exact hash plus likely duplicate on issuer/number; commit needs acknowledgement | PASS | #96, #97, #98, #99 | `phase2/…` §6, `phase3-web/07-…png`, `phase3-mobile/06-…png` |
| P4 | Totals mismatch / prompt-injection document blocked by server recompute | PASS | #97, #98, #99 | `phase2/…` §7, `phase3-web/08-…png`, `phase3-mobile/07-…png` |
| P5 | Review screen: original beside editable fields with confidence | PARTIAL | #98, #99 | Web: PASS (`phase3-web/04-…png`, `06-…png`). Mobile: a PDF shows as a file card that opens the original, not an inline rendered preview. |
| P6 | Mobile and web | PARTIAL | #98, #99 | Web proven in Chromium. Mobile proven only as an Expo web render at 390×844. No iPhone or Android device run, and camera capture is untested. |
| P7 | Source document link on the invoice/bill, opens the original | PASS | #97, #98, #99 | `phase3-web/10-…png`, `phase3-mobile/08-…png` |
| P8 | Mock provider labelled (`provider: mock`, `mock: true`, UI badge) | PASS | #97, #98 | `phase2/SUMMARY.md`, `phase3-web/04-…png` |
| P9 | Real providers off without a key (production + no key → 503 `EXTRACTION_PROVIDER_UNAVAILABLE`) | PASS | #97 | `phase2/…` §12 |
| P10 | Real OpenAI / xAI extraction | BLOCKED | #97 | No key; covered by stubbed-fetch unit tests only |
| P11 | Batch upload (`batch_id`, max 10) | PARTIAL | #96 | `batch_id` is stored and unit-tested; the 11th-file rejection is not proven in a demo |
| P12 | `Idempotency-Key` on upload/commit (same key → no new row; different body → 409) | NOT DONE | — | Commit is guarded by `IMPORT_ALREADY_COMMITTED` (409) instead |
| P13 | `NOT_AN_INVOICE` outcome, 3 retries, and a Retry button | NOT DONE | — | Mock extractor only |
| P14 | Queue-based extraction (`document-extraction` + DLQ) | NOT DONE | — | Extraction runs synchronously in the request |
| P15 | Filed GST period blocks commit, with an owner/accountant override | NOT DONE | — | — |
| P16 | Accuracy table on a real anonymised document set | BLOCKED | — | Needs the document set and a provider key |
| P17 | Mobile read-only denied screen: readable "Go back" link | PASS | #100 | `EmptyState.test.tsx` checks the `accentText` token. The screenshot `phase3-mobile/09-…png` was not retaken, so it still shows the old dark-green colour. |
| P18 | CI gates at or below baseline (API, contracts, web tsc/lint, mobile tsc/lint/jest) | PASS | #95–#100 | `phase4/SUMMARY.md`: api 247+1 skipped, contracts 99, web tsc 663, web lint 462/113, mobile lint 0/78, jest 312 |

## Infrastructure and operations

| # | Requirement | Status | PR | Evidence |
|---|---|---|---|---|
| I1 | R2 storage on a real bucket (`DOCUMENTS` binding) | BLOCKED | #96 | Only the local file-system object store was tested. `deploy/api/wrangler.jsonc` has the binding commented out as a placeholder. |
| I2 | Migrations 0017–0019 applied | NOT DONE | #95–#97 | Applied only to temporary local SQLite databases, not to any remote D1 or Supabase database |
| I3 | `OPENAI_API_KEY` in `secrets.required` | PASS (config) | #95 | `deploy/api/wrangler.jsonc`. The secret itself is not set. |
| I4 | `pnpm run deploy:check` with R2/queue bindings | BLOCKED | — | Waiting on I1 |
| I5 | Retention period and IRD offshore-storage decision (decision 13); privacy policy update | BLOCKED | — | Owner/accountant decisions |

## Totals

44 rows: **25 PASS**, **7 PARTIAL**, **7 NOT DONE**, **5 BLOCKED**.

The ledger side is proven end to end with exact journals and the GST report. The gaps are infrastructure (R2, migrations, keys), owner decisions, and several Phase-1 issue items that were never built: Idempotency-Key, the extraction queue with retries, the filed-period lock, the full third-party checklist, and a no-email "Record as issued" action.

## Needs Jeevan

1. Confirm our reading of the Crystal Touch / Cleancorp example (buyer-created TSI → sales invoice with output GST), ideally with a real anonymised Cleancorp document.
2. Create the private R2 bucket(s) (location hint `oc`) and uncomment the `DOCUMENTS` binding.
3. Set `OPENAI_API_KEY` with `wrangler secret put`. Review OpenAI data controls and decide on Zero Data Retention. Decide whether xAI is a fallback at all.
4. Decide on the retention period and IRD offshore storage (decision 13). Update the privacy policy and terms (AI processing, providers, offshore storage).
5. Ask an accountant to review the third-party panel wording and the "Record as issued" treatment.
6. Run the mobile flow once on a physical iPhone (camera capture + PDF open). Only an Expo web render has been checked.
7. Provide or approve an anonymised document set for the accuracy table.
8. Decide whether the remaining NOT DONE items (Idempotency-Key, queue + retries, filed-period lock, full third-party checklist, encrypted-PDF rejection, durable rate limit) block launch or become follow-up issues.

## Recommended merge order

#95 (Phase 0) → #96 (Phase 1) → #97 (Phase 2) → #98 (Phase 3a web) → #99 (Phase 3b mobile) → #100 (Phase 4). Each PR is stacked on the previous one. Retarget each PR to `main` after its parent merges, and re-run CI at each step.

## How to turn it on

- [ ] Merge the stack in the order above.
- [ ] Cloudflare: create the R2 bucket `ledgercraft-documents` (plus a preview bucket) and add `"r2_buckets": [{ "binding": "DOCUMENTS", "bucket_name": "ledgercraft-documents" }]` in `deploy/api/wrangler.jsonc`.
- [ ] `wrangler secret put OPENAI_API_KEY` for the API Worker. Never commit it.
- [ ] Apply migrations 0017, 0018 and 0019 through the normal deploy pipeline. No manual SQL against production.
- [ ] `pnpm run deploy:check` passes with the new binding.
- [ ] Smoke test on staging with a demo org: upload → extract (real provider, not the mock badge) → commit → issue/receive → check the journal and GST report.
- [ ] Ship the mobile build through the normal EAS pipeline (not done by agents).
