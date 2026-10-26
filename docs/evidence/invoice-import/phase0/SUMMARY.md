# Invoice import Phase 0: verification (#94)

Commit under test: `c2d26c1`. Captured on 26 Oct 2026, 18:1x NZDT, on a local macOS checkout.
- Baseline: `main` @ `3d37db5`, run in a separate worktree.
- AI keys: none were used or configured.

## Gates vs `main` baseline

| Check | main baseline | this branch | Result |
|---|---|---|---|
| `pnpm test:api` | 51 files, 175 passed, 1 skipped | 55 files, 211 passed, 1 skipped | ✅ +36 tests |
| `pnpm test:contracts` | 24 files, 89 passed | 24 files, 91 passed | ✅ +2 tests |
| `pnpm type-check:api` (api + contracts) | pass | pass | ✅ |
| web `vitest src/lib/csv.test.ts` | n/a (new) | 1 passed | ✅ |
| web `pnpm type-check` (CI gate ≤728) | 663 errors | 663 errors | ✅ unchanged |
| web `pnpm lint` (CI gate ≤468) | 462 errors, 113 warnings | 462 errors, 113 warnings | ✅ unchanged |
| mobile `npm run type-check` | pass | pass | ✅ |
| mobile `npm run lint` | 0 errors, 78 warnings | 0 errors, 78 warnings | ✅ unchanged |

The raw web tsc/eslint logs are not committed because of their size. The gate outputs are in `branch-web-*-gate.txt`.

## Local API demo (`local-api-demo.txt`, script `local-api-demo.sh`)

Setup: a real `tsx src/index.ts` server on 127.0.0.1:3017, with a fresh temp SQLite database migrated by `db:migrate` (including 0017). All data is synthetic. The role is changed by editing the demo user's membership row in the temp database.

**Route access by role:**
- **read_only:** **403** on `POST /api/invoices-import`, the `invoices-export.csv`, `bills-export.csv`, `vendors-export.csv` and `bank-transactions/export.csv` exports, and `POST /api/ai/receipt-scan` and `/api/ai/chat`.
- **accountant:**
  - **200** on the import and all four CSV exports.
  - **503** on the AI routes. This means the request passed the permission check and then hit "AI not configured" because no key is set locally.

**Imported `paid` invoice (`LEGACY-1001`, 200.00 + 15% GST):**
- It is stored as `INV-2026-0001` with `external_number=LEGACY-1001` and status `paid`.
- A real payment of 230.00 (bank_transfer) is created.
- Invoice journal: Dr 1200 AR 230.00 / Cr 4000 Sales 200.00 / Cr 2200 GST 30.00. **Balanced.**
- Payment journal: Dr 1110 Bank 230.00 / Cr 1200 AR 230.00. **Balanced.**
- The invoices export CSV has an `externalNumber` column.

**Locked attachment:** deleting a `source_document`/locked attachment returns **409 `SOURCE_DOCUMENT_LOCKED`**, and the row still exists afterwards.

## Not verified here
- A successful AI call. No provider key was used, by policy. Unit tests cover the OpenAI-first and xAI-fallback order.
- Bill/input GST (2150) journals. They are unchanged by this PR and were not exercised in the demo.
- Cloudflare/D1 deploy. Nothing was deployed, and the `OPENAI_API_KEY` secret must be set before the next deploy.
- UI screenshots. This phase has API/config changes only.
