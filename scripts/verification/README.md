# LedgerCraft verification architecture (experimental)

## Layers

1. **Application orchestration:** `.agents/skills/verify-ledgercraft/SKILL.md` is the canonical entrypoint. It documents doctor, isolated app startup, feature maps, browser interaction, evidence and cleanup.
2. **Engineering gates:** `.cursor/skills/verify-{build,tests,lint,api,ui,database,security,pr}/SKILL.md` expose focused checks. The CLI/planner implements the deterministic selection.
3. **Application recipes:** `.agents/skills/verify-ledgercraft/references/features/` contains authentication, invoices and payments journeys.
4. **Existing domain skills:** `ledgercraft-verify`, `ledgercraft-verify-ui`, and `ledgercraft-tdd` retain detailed implementation-specific procedures.

## Commands

```bash
node scripts/verification/doctor.mjs
node --test scripts/verification/tests/*.test.mjs
node scripts/verification/cli.mjs fast
VERIFY_BASE=origin/main node scripts/verification/cli.mjs pr
node scripts/verification/cli.mjs standard --check=verify-ui
```

The CLI records full sanitized logs and bounded JSON summaries under `artifacts/verification/`. Individual check invocations do not establish PR readiness.

## Limitations — this PR remains a draft

- Doctor checks prerequisites and port availability, but does not yet launch or isolate services/worktrees.
- The feature map is a human/agent recipe, not executable test coverage.
- Database integration requires isolated PostgreSQL provisioning, migration validation and tenant isolation; currently not automated by the runner.
- Security scanning and diagnostic baseline fingerprinting are not implemented and must not be reported as passing.
- API contract check is not yet live HTTP/schema compatibility; UI selection is not feature-aware.
- `verify-lint` is currently full-project lint; existing CI baselines still apply.
- The experimental workflow is manual-only. Existing `ci.yml` remains authoritative.
- Best-effort log redaction is not sufficient for real secrets or customer data. Only use synthetic fixtures.

No check may claim production readiness based only on compilation, mocked persistence or exit code zero.
