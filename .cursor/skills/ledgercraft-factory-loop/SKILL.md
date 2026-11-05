---
name: ledgercraft-factory-loop
description: Run LedgerCraft issues one at a time across Codex Cloud and a local MacBook, from claim through verified pull request and independent review. Use for factory, autonomous backlog, scheduled issue work, or cross-machine Codex handoffs.
---

# LedgerCraft factory loop

Use [docs/FACTORY_LOOP.md](../../../docs/FACTORY_LOOP.md) as the dispatcher and handoff contract. `docs/PIPELINE.md` remains the authority for labels, risk, review, and merge eligibility.

## Required loading

1. Read `ledgercraft-bootstrap`, `docs/PIPELINE.md`, and the selected issue.
2. Read the domain, TDD, UI, and verification skills named by `AGENTS.md`.
3. For mobile work, also read `ledgercraft-mobile-loop`; Expo/EAS routing starts with the installed `expo-overview` skill when available.

## One-issue rule

- A run resumes existing factory work before selecting anything new.
- At most one issue may carry `agent:building` across this factory.
- Do not select another issue while its implementation PR is open, pending CI, awaiting review, or awaiting a human decision.
- Each new issue starts in a fresh Codex session and isolated worktree from the current upstream base.

## Runner routing

- `runner:cloud`: code and checks need only the repository, network, and hosted CI.
- `runner:macbook`: local Android emulator/device, Keychain/signing, local-only tools, or local files are required.
- `device-qa-pending`: implementation checks pass, but named installed-device proof is still outstanding. It is not a pass.

Cloud is the only dispatcher. It may hand work to the MacBook, but the two surfaces never select new issues independently. Read [references/cloud-run.md](references/cloud-run.md) for the Cloud prompt and [references/local-android.md](references/local-android.md) for the MacBook prompt.

## State transitions

1. `spec-ready` → claim by adding one runner label and `agent:building`, then removing `spec-ready`.
2. Build test-first, verify proportionately, self-review, commit, push, and open one PR linked with `Closes #<issue>`.
3. When CI and required local evidence are green, replace `agent:building` with `agent:review`. Add `device-qa-pending` instead when Android/device evidence is missing.
4. A different Codex session performs the independent review from `ledgercraft-reviewer`.
5. The original builder session handles review fixes. After two delta-review rounds, use `needs-human`.
6. Risk-medium/high work stays human-merge only. Never merge, deploy, publish OTA, submit stores, or alter production merely because the loop is scheduled.

## Stop and report

Stop without selecting more work when the base or ownership is ambiguous, a dependency is open, tracked changes are unexplained, credentials or product decisions are required, CI is pending, Android proof cannot run, or a PR needs human merge. Report only a new PR, actionable failure, decision request, completed review, or merge.
