# LedgerCraft verification skills (experimental)

Eight agent entrypoints are in `.cursor/skills/verify-*/SKILL.md`: verify-build, verify-tests, verify-lint, verify-api, verify-ui, verify-database, verify-security, verify-pr.

Run `node --test scripts/verification/tests/*.test.mjs` to test the planner.
Run `node scripts/verification/cli.mjs fast|standard|pr` for change-aware execution.
Run `node scripts/verification/cli.mjs standard --check=verify-tests` for a diagnostic single-check invocation.

The planner is pure; the CLI handles Git discovery, execution and reporting. It emits `artifacts/verification/summary.json` and sanitized logs. Logs are best-effort redacted, not guaranteed secret-free. Use synthetic data only. The GitHub workflow is manual-only until validated.

## Known limitations — do not merge as a required quality gate

- Database tests need a disposable PostgreSQL environment, migrations and isolation checks; the CLI does not provision one.
- Security scanning is not implemented. Sensitive changes block rather than receive a false pass.
- `verify-api` currently runs contracts tests only, not live HTTP/schema compatibility.
- `verify-ui` invokes the existing Playwright suite; it does not yet select affected flows.
- `verify-lint` runs whole-project ESLint, not changed-file lint; current lint/type-check baselines require fingerprint comparison.
- A single-check run intentionally blocks when other required checks were not executed.
- PR mode currently runs the selected matrix, but cannot establish readiness until domain checks and baseline handling are completed.
- Existing `.github/workflows/ci.yml` remains authoritative.

Never point verification at production or claim a financial feature verified on the basis of compilation alone.
