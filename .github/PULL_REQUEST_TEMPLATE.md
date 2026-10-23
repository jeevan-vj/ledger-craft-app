Closes #N

## Summary

## Test plan

- [ ]

## Risk self-assessment

Tick one level. The paths live only in `docs/PIPELINE.md`. Tick every high-risk bullet from that file that this pull request touches. `risk:high` applies when any of those bullets match.

- [ ] `risk:low` — docs, copy, or a local change outside the `docs/PIPELINE.md` high-risk list
- [ ] `risk:medium` — product behaviour outside that list
- [ ] `risk:high` — one or more `docs/PIPELINE.md` bullets:
  - [ ] Migrations or Drizzle
  - [ ] Money, GST, invoice, or quote calculation
  - [ ] Auth, including `api/src/index.ts`
  - [ ] Workflows, release config, `.github/scripts/ci-baseline-gate.mjs`, or a lint/typecheck baseline
  - [ ] Verification policy (`ledgercraft-verify`, `ledgercraft-reviewer`, `ledgercraft-invariants`, `docs/PIPELINE.md`, this template)
  - [ ] Secrets
  - [ ] Major dependency bumps

`auto-merge-eligible` requires every stage-6 condition in `docs/PIPELINE.md`: `risk:low`, green CI, `review-passed` from a different reviewer, no unresolved threads, line count under 300 and file count under 15 (`git diff --numstat origin/main...HEAD`, sum both columns), and no CODEOWNERS path. `review-passed` plus `risk:low` is not enough. The merge gate is not in this repository yet.

## Screenshots

UI changes: paste before and after images here. Agent-written UI changes also include a phone-width (390×844) screenshot.

## Agent evidence

Authors fill this from `.cursor/skills/ledgercraft-verify/SKILL.md`. A missing table, an empty table, or a checked box without command output is a blocker on every pull request, including docs and skills. `not run` is allowed only for `node-major`, `tool-missing`, or `billing`, and only until the matching GitHub job is green. The author does not mark `review-passed`.

| Job | Node | Result |
| --- | --- | --- |
| Web lint (`pnpm lint` + gate 468) | | |
| Web typecheck (gate 728) | | |
| Web unit tests (`pnpm test:run`) | | |
| Web build (`pnpm build`) | | |
| API & contracts (Node 24) | | |
| Release readiness (two `node --test` commands) | | |
| Mobile lint / tsc / Jest / iOS export (Node 20) | | |

- Risk label and why:
- CODEOWNERS paths:
- Diff size (`git diff --numstat origin/main...HEAD`, sum of both columns, and the row count):
- Rollback:
- After merge:
