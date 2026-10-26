# Invoice import Phase 1: verification (#94)

Stacked on Phase 0 (#95, `e28ad48`). Implementation commit under test: `510dc53`. Captured 26 Oct 2026, ~19:00 NZDT, on a local macOS worktree. No AI keys used; no deploy; no Supabase/Cloudflare changes. Implementation by Codex CLI (`codex exec --approve-for-me`); the operator made one lint-only fix and wrote the demo script.

## Gates vs Phase 0 baseline

| Check | Phase 0 (#95) | this branch | Result |
|---|---|---|---|
| `pnpm test:api` | 211 passed, 1 skipped | 58 files, 233 passed, 1 skipped | ✅ +22 |
| `pnpm test:contracts` | 91 passed | 25 files, 97 passed | ✅ +6 |
| `pnpm type-check:api` (api + contracts) | pass | pass | ✅ |
| web `pnpm type-check` | 663 errors | 663 errors | ✅ unchanged |
| web `pnpm lint` | 462 errors, 113 warnings | 462 errors, 113 warnings | ✅ unchanged |
| mobile `npm run type-check` | pass | pass | ✅ |
| mobile `npm run lint` | 0 errors, 78 warnings | 0 errors, 78 warnings | ✅ unchanged |

## Local API demo (`local-api-demo.txt`, script `local-api-demo.sh`)

Real `tsx src/index.ts` server on 127.0.0.1:3018, fresh temp SQLite migrated by `db:migrate` (incl. 0018), temp object dir. Synthetic orgs: "Crystal Touch Cleaning" (A) and "Other Demo Org" (B). Fixtures are script-generated (`api/scripts/generate-invoice-import-fixtures.mjs`).

| Step | Result |
|---|---|
| Upload Cleancorp PDF (owner A) | 201, sha256 stored |
| Upload photo-style JPG, filename `../../invoice photo.jpg` | 201, stored as `invoice photo.jpg` |
| Re-upload same PDF | 201 + `duplicateWarnings[0].existingDocumentId` = first doc |
| Text file declared `application/pdf` | 415 `UNSUPPORTED_MEDIA_TYPE` |
| 1.2 MB file | 413 `FILE_TOO_LARGE` (cap 1 MB without R2) |
| Download as owner A | 200, `private, no-store`, `nosniff`, attachment, sha256 matches original |
| Org B: GET file / GET metadata / DELETE on A's doc | 404 / 404 / 404; B's list is empty |
| read_only upload | 403 `Missing permission: invoices.import`; read_only download 200 (view rules) |
| DELETE while linked to an invoice | 409 `IMPORT_DOCUMENT_LINKED`; document kept |
| Audit events | `uploaded` 3, `file_downloaded` 2, `delete_attempted` 1 |

The invoice link in the delete-blocked step is set directly in the temp DB (the Phase 2 commit flow will set it).
