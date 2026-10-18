# Token-efficient verification (initial implementation)

Run `node scripts/verification/cli.mjs fast|standard|pr`.
Set `VERIFY_BASE=origin/main` when verifying a PR; fetch that ref first.

The CLI selects web, API, contracts, and mobile checks using the changed paths, stores full logs under `artifacts/verification/`, and prints a bounded structured summary. It is intentionally fail-closed for accounting, security and database changes in standard/PR profiles until domain-specific isolated verification is implemented.

**Limitations:** path classification is conservative, not an import graph. The current CI has known lint, TypeScript and mobile test baselines; this CLI does not waive them. Existing `ci.yml` remains authoritative. This first PR must not be made a required check until baseline handling, DB evidence and test coverage are completed. Do not claim a financial feature verified merely because this script passed.

The runner executes repository commands, so run only on trusted checked-out code. Never point database tests at production.
