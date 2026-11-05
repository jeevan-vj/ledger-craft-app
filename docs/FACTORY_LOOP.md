# Codex factory loop

This is the cross-machine operating contract for moving one LedgerCraft issue from `spec-ready` to a reviewed pull request. GitHub is the durable queue. Codex Cloud dispatches; the MacBook runs work that needs local Android or other local-only capabilities.

The software-factory state, risk, review, and merge rules remain in [PIPELINE.md](PIPELINE.md). Domain requirements remain in `AGENTS.md`, `TARGET_ARCHITECTURE.md`, and the selected issue.

## Why the loop is split

Cloud tasks are suitable when the repository, network, and hosted CI are sufficient. Local Android proof needs the MacBook, Android SDK/emulator or device, and sometimes local signing/keychain access. The surfaces share GitHub state; they do not share uncommitted files or an implicit conversation.

Only Cloud selects new issues. This avoids a MacBook run and a Cloud run claiming the same work. A scheduled task schedules work; it does not relax permissions or prove completion.

## Durable state

| State | Meaning |
| --- | --- |
| `spec-ready` | Acceptance criteria are buildable without guessing. |
| `agent:building` | The single issue currently owned by the factory. |
| `runner:cloud` | The claimed issue can be completed in Cloud. |
| `runner:macbook` | The claimed issue needs local Android or another local-only capability. |
| `device-qa-pending` | Code checks pass but named installed-device evidence is missing. |
| `agent:review` | Builder work, required evidence, and CI are ready for an independent session. |
| `needs-human` | Scope, credentials, product decision, conflict, or high-risk merge needs a person. |

There must be zero or one `agent:building` issues. More than one is a stop condition. Runner labels describe execution location, not approval or quality.

## Dispatcher selection

Every Cloud invocation reads live GitHub state before acting:

1. If an issue has `agent:building`, resume or report it.
2. If that active issue has a linked PR, wait for or repair CI/review; do not select new work. Unrelated legacy PRs are outside this factory lock.
3. If a PR has `agent:review`, use a separate review session; the builder cannot review itself.
4. If the current issue needs a decision or credentials, apply/retain `needs-human` and stop.
5. Only when no work is active, walk epic #140 in dependency order and select the first open `spec-ready` issue whose dependencies are complete.
6. Route any `area:mobile` issue or installed-device acceptance criterion to `runner:macbook`; otherwise prefer `runner:cloud`.

Claim before creating a worktree: add `agent:building` and one runner label, remove `spec-ready`, comment the base SHA and execution surface, then read the issue back. If the state is inconsistent, stop without coding.

## Builder contract

- Fresh Codex session and isolated worktree per issue.
- Current upstream base; never build from a dirty or behind primary checkout.
- One issue, branch, and implementation PR. Branch format: `codex/issue-<number>-<slug>`.
- Test first, then the smallest implementation satisfying the acceptance criteria.
- Run `ledgercraft-verify`; run domain/UI skills and evidence gates that apply.
- PR body contains `Closes #<number>`, real command output, screenshots/device evidence, risk, rollback, non-goals, and external gaps.
- Wait for hosted CI. Do not declare completion while jobs are queued or running.
- Do not select another issue until this PR is merged or explicitly abandoned.

The original builder session/environment owns review fixes. If it is no longer recoverable, a human decides whether to transfer ownership; a new session does not silently rewrite the branch.

## Local Android gate

For mobile changes, the MacBook runner performs CI-matching Node 20 checks plus Android-specific evidence:

1. `npm ci`, lint, strict TypeScript, Jest, and the required iOS CI export.
2. `EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true npx expo export --platform android --output-dir /tmp/expo-android`.
3. Inspect `adb devices` and available emulators before claiming device proof.
4. Install/run the appropriate local build on an emulator or authorised physical device when the change can be exercised there.
5. Record Android version, device/emulator class, app build/runtime, authenticated scenario, network/offline states that apply, and screenshots or recording.

An Android export proves bundling only. If an emulator/device cannot be used, add `device-qa-pending`, keep the PR draft, and report the exact missing gate.

## Review and merge

An independent fresh Codex session follows `ledgercraft-reviewer`. Review fixes return to the original builder. The delta-review cap and PASS/CHANGES REQUESTED format are in `PIPELINE.md`.

Risk-medium and risk-high PRs require human merge. No factory prompt authorizes Cloudflare deployment, production mutation, EAS build/submission, OTA publication, App Store/Play publication, tester invitations, or credential creation.

## Scheduling

Use the prompt in `.cursor/skills/ledgercraft-factory-loop/references/cloud-run.md` for one Cloud scheduled task. Run it on weekdays or manually; one dispatcher is safer than separate selectors. Official Codex guidance supports scheduled work and fresh sessions, but local-file/device tasks require the desktop app and MacBook to be available.

Use `.cursor/skills/ledgercraft-factory-loop/references/local-android.md` for the local handoff. The local runner does not need its own selector schedule; it only resumes work already labelled `runner:macbook`.

Recommended starting cadence:

- Cloud dispatcher: weekdays at 07:30 `Pacific/Auckland`.
- MacBook runner: manual when notified, or weekdays at 08:00 while the desktop app is running.
- Independent review: start after `agent:review`; never in the builder session.

Pause the Cloud schedule before manually running another dispatcher. A schedule delivery is not evidence that the task or PR finished.
