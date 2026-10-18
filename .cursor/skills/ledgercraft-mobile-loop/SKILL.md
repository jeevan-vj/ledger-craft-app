---
name: ledgercraft-mobile-loop
description: Run LedgerCraft's repeatable mobile parity loop: select one safe backlog slice, implement it test-first, verify Expo, and prepare one reviewable pull request. Use for autonomous or scheduled mobile feature progression.
---

# LedgerCraft mobile feature loop

Advance one mobile slice per run. A run ends at one pull request or at a clearly reported stop condition; it never chains unreviewed PRs.

## Load

Read, in order:

1. `ledgercraft-bootstrap` and `TARGET_ARCHITECTURE.md`.
2. `AKAUNTING_FEATURE_PARITY_BACKLOG.md`.
3. `ledgercraft-mobile-ui`, `ledgercraft-tdd`, and `ledgercraft-verify`.
4. `ledgercraft-knowledge-sync` before closing the slice.

## State machine

1. **Inspect** — confirm the current branch, tracked changes, open PRs, and latest merged base. Preserve unrelated and untracked files. If a previous loop PR is open, inspect its CI and review state instead of selecting another feature.
2. **Pick** — choose the smallest dependency-ordered mobile gap whose Hono contract already exists. Prefer a complete user journey over a broad screen inventory. Record the selected acceptance boundary and explicit non-goals in the PR.
3. **Red** — add a failing test for the transport or form/domain rule before production code.
4. **Green** — implement through the existing authenticated API client, TanStack Query, React Navigation, and mobile design primitives. Keep exact money as decimal text across API/form boundaries.
5. **Verify** — run focused tests, strict TypeScript, the full mobile Jest suite, lint, and iOS/Android production exports. Perform authenticated native QA only when a safe test session is available; otherwise name it as pending.
6. **Sync** — update present-tense status in `TARGET_ARCHITECTURE.md`, `Agents.md`, bootstrap, and the parity backlog when capability status changed.
7. **Review** — inspect the complete diff against the intended base. Fix correctness, accessibility, error/empty/loading states, and any new lint warnings.
8. **PR** — only when the initiating user or automation prompt authorizes GitHub writes: commit, push the feature branch, open one PR, attach it to the task, and report verification plus remaining gaps.
9. **Wait** — do not pick another feature until that PR is merged or explicitly abandoned. On later runs, repair actionable CI/review failures before new work.

## Selection rules

- Prefer mobile parity for an already-deployed API domain. Do not silently expand a mobile task into schema, migration, deployment, or architecture work.
- Do not claim an AKP task complete when only its mobile surface is added.
- Keep customer, organisation, exact-decimal, and authentication boundaries intact.
- A device-only or credential-dependent gate is a reported handoff, not a reason to fabricate verification.

## Stop conditions

Stop without mutating GitHub when tracked work is unexplained, the intended base or repository is ambiguous, the next slice requires a product decision, the API contract is missing, or completing the slice requires production credentials or a deployment not authorized by the prompt.

For scheduled use, the automation prompt must explicitly authorize branch/commit/push/PR creation and should run daily or on weekdays. It should stay quiet when a prior PR remains open and unchanged, and notify only for a new PR, actionable failure, required decision, or completed merge.
