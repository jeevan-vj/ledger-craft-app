# Task packet

A coordinator can paste this. It is not a second spec and it does not weaken a gate.

```text
Task:
Acceptance:
Non-goals:
Risk (docs/PIPELINE.md): low | medium | high
Module row: docs/agent/CODEMAP.md#
Allowed actions:
Forbidden: migrations | money formula changes | auth | deploy | merge | emulator
Focused test: (docs/agent/TEST_MATRIX.md command)
Evidence required: (ledgercraft-verify-ui, or none for a non-UI change)
Stop when:
Head to branch from:
```

Include the invariant sections that can actually break (tenant, decimal text, idempotency, calendar day). Do not attach the accounting history. A bugfix, UI, API, or review label here is the `taskType` used later by `docs/agent/EFFICIENCY.md`.
