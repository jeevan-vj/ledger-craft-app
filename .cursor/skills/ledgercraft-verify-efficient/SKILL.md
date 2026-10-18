---
name: ledgercraft-verify-efficient
description: Compatibility entrypoint for LedgerCraft verification; delegates to the canonical application skill.
---

# LedgerCraft verification

Read `.agents/skills/verify-ledgercraft/SKILL.md` first. This is the canonical application-level orchestration workflow with doctor checks, feature references, behavioral evidence and cleanup. The `.cursor/skills/verify-*/SKILL.md` entries are individual deterministic engineering gates.

Do not independently duplicate verification logic here. Use the shared CLI, retain failure artifacts, and never mark blocked or unexecuted checks as passed.
