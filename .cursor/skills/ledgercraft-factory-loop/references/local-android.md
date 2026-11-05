# MacBook Android runner prompt

Use this in a fresh local Codex session while the Codex desktop app is running and Android tooling is available.

```text
Continue the LedgerCraft factory loop as the MacBook runner.

Read AGENTS.md, .cursor/skills/ledgercraft-factory-loop/SKILL.md, docs/FACTORY_LOOP.md, docs/PIPELINE.md, and the selected issue. GitHub writes for the claimed issue, feature branch, commit, push, PR, comments, and labels are authorized. Deployment, merge, production writes, EAS build/submission, OTA publication, and store publication are not authorized.

Inspect live state. Work only on the single open issue labelled agent:building and runner:macbook. If none or more than one exists, stop and report. Resume an existing branch/PR instead of creating duplicates.

Use a clean isolated worktree from current upstream main. Implement test-first using the relevant skills. Run the complete ledgercraft-verify matrix. For mobile changes also run an Android production export, then use an available local emulator or authorised physical device for the issue's authenticated flow. Record device ID/class, Android version, build/runtime, steps, screenshots/recording, results, and honest gaps. An export is not device proof.

Self-review, commit, push, open one PR with Closes #<issue>, and wait for hosted CI. If code and required device proof pass, remove agent:building and device-qa-pending, add agent:review, and retain runner:macbook on the open issue as the factory lock until merge or explicit abandonment. If device proof cannot run, keep the PR draft, add device-qa-pending, and stop. Never select another issue or merge.
```
