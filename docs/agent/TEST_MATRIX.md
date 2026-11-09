# Test matrix

Full CI commands and Node majors stay in `ledgercraft-verify`. The job names in `.github/workflows/ci.yml` are unchanged. Use the rows below while developing. A green scoped run does not replace the seven jobs.

`pnpm test:api`, `pnpm test:contracts`, and `pnpm test:run` call `scripts/targeted-test.mjs`. The wrapper deletes one leading `--` that pnpm inserts, then runs Vitest or Jest with the filename still in argv. It exits 1 when the runner reports a different file count. With no filename, the same command is the full package suite CI already runs.

This was checked with Vitest 3.2.4: `vitest run src/sale.test.ts` ran 1 file; `vitest run -- src/sale.test.ts` ran every included file. Do not add your own `--` before the path.

| Task | Command | Node | What “scoped” means |
| --- | --- | --- | --- |
| One API file | `pnpm test:api -- src/modules/sales/sales.test.ts` | 24 | Vitest `Test Files (1)` from `api/` |
| One contract file | `pnpm test:contracts -- src/sale.test.ts` | 24 | Vitest `Test Files (1)` from `packages/contracts/` |
| One web file | `pnpm test:run -- src/pages/Settings.test.tsx` | 22 | Vitest `Test Files (1)` from the repo root |
| One mobile file | `cd mobile && npm test -- src/screens/sales/SellScreen.test.tsx` | 20 | Jest `Test Suites: 1 total` |
| Full API suite | `pnpm test:api` | 24 | Whole `api/src/**/*.test.ts` include |
| Full contracts suite | `pnpm test:contracts` | 24 | Whole `packages/contracts/src/**/*.test.ts` include |
| Full web suite | `pnpm test:run` | 22 | Whole web include. This is the CI unit job |
| Full mobile suite | `cd mobile && npm test -- --ci --watchAll=false` | 20 | CI form. No filename |
| Tooling in this change | `node --test scripts/agent-efficiency.test.mjs scripts/agent-preflight.test.mjs scripts/targeted-test.test.mjs scripts/agent-docs.test.mjs` | 22 is enough | Node’s test runner. No pnpm install |

Paths are relative to the package directory (`api/`, `packages/contracts/`, the repo root, or `mobile/`). A repo-relative path from the wrong directory matches nothing, and the wrapper then fails closed.

`--reporter=json` skips the file-count assertion because the summary line is gone. Prefer the default reporter for a scoped run. The full log is under the printed `log:` path. Read that file for a failure body. Do not paste it back in full.

`pnpm type-check:api`, `pnpm lint`, and the two `tsc --noEmit` project checks do not take a filename. Run them as `ledgercraft-verify` describes.
