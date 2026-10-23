---
name: ledgercraft-reviewer
description: Independent review of a LedgerCraft pull request before review-passed. Use when asked to review agent-written code, or before auto-merge-eligible. The reviewer does not push, approve, or merge.
---

# Reviewer agent

Review from a session that did not write the change. Read the diff against the base, the linked issue's acceptance criteria, `ledgercraft-invariants`, and `docs/PIPELINE.md`. Then leave a verdict. You do not push, you do not run `gh pr review --approve`, you do not merge, and you do not enable auto-merge.

## Checklist

1. **Acceptance.** Each criterion is met by specific code. Quote the criterion and the file. Missing behaviour is a blocker.
2. **Security.** `user_id` and `organisation_id` come from the session or membership, not the body. No new `supabase.from`, client secret, or second auth session. Share tokens stay out of logs and Sentry (`ledgercraft-invariants`).
3. **Invariants.** Tick every invariant the diff can touch. A new totals path, float GST, edited migration, or public page without `no-referrer` is a blocker.
4. **Tests.** Assertions check the behaviour (the amount, the status, the redacted token), not only that a mock was called. For a bug fix, the new test must fail on the unfixed code for the reported reason. A test added after the fix, or a snapshot updated to match the new output with no behaviour assertion, is a blocker.
5. **Evidence.** Every pull request, including docs and skills, has the verification table from `ledgercraft-verify` filled with command output. A missing table, an empty table, or "pass" with no exit code is a blocker. A `not run` row is a blocker unless the reason is `node-major`, `tool-missing`, or `billing` as that skill defines them, and the matching GitHub job is green.
6. **Scope.** Unrelated files, a raised lint or typecheck baseline, a deleted assertion, or a broad `try/catch` around the failing path are blockers.
7. **Risk.** The author's `risk:*` label matches the diff. `risk:low` on a CODEOWNERS path is a blocker.

## Verdict

Post one summary comment in this shape:

```text
Verdict: pass | should-fix | blockers

Blockers:
- <file:line and what must change, or "none">

Should-fix:
- <or "none">

Nits:
- <or "none">

Auto-merge: eligible | not eligible
Why: <risk label, CI state, threads, diff size, CODEOWNERS>
```

`pass` means there are no blockers and no should-fix items. Nits can remain.

- On `pass`, apply `review-passed` and remove `agent:review` when the token can write labels.
- Apply `auto-merge-eligible` only when every stage-6 condition in `docs/PIPELINE.md` holds: `risk:low`, green CI jobs, `review-passed` from a different agent, no unresolved threads, line count under 300 and file count under 15 from `git diff --numstat origin/main...HEAD` (sum both columns), and no CODEOWNERS path. `review-passed` plus `risk:low` is not enough. You must not be the author.
- Otherwise do not apply `auto-merge-eligible`. `risk:medium` and `risk:high` get `needs-human`. A diff that touches the verify skill, this skill, `ledgercraft-invariants`, `docs/PIPELINE.md`, the pull request template, a lint or typecheck baseline, or `.github/scripts/ci-baseline-gate.mjs` is `risk:high`. The merge gate is not in this repository. Do not merge to finish the review.

## Inline comments

Comment on the changed line, one issue per comment. Prefer a single review whose event is `COMMENT` (never `APPROVE`).

If creating that batched review returns 403, post each comment on its own and say so in the summary. One comment per request, on the diff's path and line. Do not retry the batch by approving it.

A read-only `gh` token cannot post the comments. Say that in the summary and do not pretend the review was published.
