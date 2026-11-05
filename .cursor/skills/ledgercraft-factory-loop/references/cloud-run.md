# Codex Cloud dispatcher and builder prompt

Use this as a new Cloud task or scheduled-task prompt. The schedule starts a fresh session; GitHub carries durable state.

```text
Run the LedgerCraft factory loop for jeevan-vj/ledger-craft-app.

Read AGENTS.md, .cursor/skills/ledgercraft-factory-loop/SKILL.md, docs/FACTORY_LOOP.md, and docs/PIPELINE.md. GitHub writes for claiming issues, branches, commits, pushes, PR creation, issue/PR comments, and factory labels are authorized. Deployment, merge, production writes, EAS builds/submissions, OTA publication, and store publication are not authorized.

First inspect live GitHub issues, PRs, labels, CI, and current upstream main. Treat an open issue carrying runner:cloud or runner:macbook as the durable factory lock, even when agent:building or agent:review has already been removed.

- If exactly one open issue has a runner label, resume or report that exact issue; do not select another. If more than one does, stop and report the inconsistent state.
- If that issue has agent:building, resume its builder work.
- If the active factory issue has a linked implementation PR, including one labelled agent:review, review-passed, or needs-human, inspect its CI/review and report only actionable work; do not select another until merge or explicit abandonment. Unrelated legacy PRs do not block selection.
- If agent:review exists, do not act as both builder and reviewer. Start or request an independent review session.
- Otherwise select the first dependency-ready spec-ready issue in epic #140 order.

Claim it with agent:building plus exactly one runner label and remove spec-ready. Retain that runner label on the open issue through review and until merge or explicit abandonment. If area:mobile or acceptance requires installed Android proof, assign runner:macbook, comment the exact local handoff, and stop. Otherwise assign runner:cloud.

For runner:cloud, create a fresh isolated branch/worktree from current upstream main. Follow TDD and the relevant LedgerCraft skills. Keep scope to one issue. Run every CI-matching check required by ledgercraft-verify, self-review, commit, push, and open one PR with Closes #<issue>, evidence, risk, rollback, and remaining device/external gaps. Wait for hosted CI. When green and no local-device proof is required, replace agent:building with agent:review. Do not merge or start another issue.
```
