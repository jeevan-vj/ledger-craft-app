---
name: ledgercraft-reviewer
description: Independent review of a LedgerCraft pull request before review-passed. Use when asked to review agent-written code, when a builder self-reviews before opening a pull request, or before auto-merge-eligible. The reviewer does not push, approve, or merge. The review loop is docs/PIPELINE.md.
---

# Reviewer agent

Review from a session that did not write the change. Read the diff against the base, the linked issue's acceptance criteria, `ledgercraft-invariants`, and `docs/PIPELINE.md`. Then leave a verdict. You do not push, you do not run `gh pr review --approve`, you do not merge, and you do not enable auto-merge.

The review loop is the Review loop section of `docs/PIPELINE.md`. This skill is the checklist, the verdict comment, and the head-commit check. Who applies the review fixes, the re-review cap, and who merges stay in that section.

The builder may run this checklist on their own change before opening the pull request. That self-review does not post the verdict below, does not apply `review-passed`, and is not the independent review. The independent review is a different session.

## Checklist

1. **Acceptance.** Each criterion is met by specific code. Quote the criterion and the file. Missing behaviour is a blocker.
2. **Security.** `user_id` and `organisation_id` come from the session or membership, not the body. No new `supabase.from`, client secret, or second auth session. Share tokens stay out of logs and Sentry (`ledgercraft-invariants`).
3. **Invariants.** Tick every invariant the diff can touch. A new totals path, float GST, edited migration, or public page without `no-referrer` is a blocker.
4. **Tests.** Assertions check the behaviour (the amount, the status, the redacted token), not only that a mock was called. For a bug fix, the new test must fail on the unfixed code for the reported reason. A test added after the fix, or a snapshot updated to match the new output with no behaviour assertion, is a blocker.
5. **Evidence.** Every pull request, including docs and skills, has the verification table from `ledgercraft-verify` filled with command output. A missing table, an empty table, or "pass" with no exit code is a blocker. A `not run` row is a blocker unless the reason is `node-major`, `tool-missing`, or `billing` as that skill defines them, and the matching GitHub job is green. A mobile UI change also includes the Mobile screenshots / device checks section from that template, including **Device checks pending** (`none` is allowed). A screenshot or recording that claims a platform that was not run is a blocker. The rules are the Mobile section of `ledgercraft-verify-ui`.
6. **Scope.** Unrelated files, a raised lint or typecheck baseline, a deleted assertion, or a broad `try/catch` around the failing path are blockers.
7. **Risk.** The author's `risk:*` label matches the diff. `risk:low` on a CODEOWNERS path is a blocker.

## Verdict

Post one summary comment in this shape:

```text
Verdict: PASS | CHANGES REQUESTED

Blockers:
- <file:line and what must change, or "none">

Should-fixes:
- <or "none">

Nits:
- <or "none">

Reviewed: <head SHA on the first review, or last-reviewed-sha..head-sha on a delta re-review>

Auto-merge: eligible | not eligible
Why: <risk label, CI state, threads, diff size, CODEOWNERS>
```

`PASS` means there are no blockers and no should-fix items. Nits can remain. `CHANGES REQUESTED` means there is at least one blocker or should-fix.

On a revision, review only the delta since the last commit this review covered. The `Reviewed` line names that range. Apply the delta re-review cap in the Review loop section of `docs/PIPELINE.md`.

- On `PASS`, apply `review-passed` and remove `agent:review` when the token can write labels.

## Before recommending merge

Before a `PASS` that recommends merge, confirm the review fixes are on the pull request head commit. Compare the head SHA (`gh pr view --json headRefOid`) with the commits that contain those fixes. A `PASS`, `review-passed`, or a merge recommendation recorded against an older SHA is not valid. If the head moved after the review, re-review that delta before recommending merge. This check is part of the review loop in `docs/PIPELINE.md`.

- Apply `auto-merge-eligible` only when every stage-6 condition in `docs/PIPELINE.md` holds: `risk:low`, green CI jobs, `review-passed` from a different agent, no unresolved threads, line count under 300 and file count under 15 from `git diff --numstat origin/main...HEAD` (sum both columns), and no CODEOWNERS path. `review-passed` plus `risk:low` is not enough. You must not be the author.
- Otherwise do not apply `auto-merge-eligible`. `risk:medium` and `risk:high` get `needs-human`. A diff that touches the verify skill, this skill, `ledgercraft-invariants`, `docs/PIPELINE.md`, the pull request template, a lint or typecheck baseline, or `.github/scripts/ci-baseline-gate.mjs` is `risk:high`. The merge gate is not in this repository. Do not merge to finish the review.

## Inline comments

Comment on the changed line, one issue per comment. Prefer a single review whose event is `COMMENT` (never `APPROVE`).

If creating that batched review returns 403, post each comment on its own and say so in the summary. One comment per request, on the diff's path and line. Do not retry the batch by approving it.

A read-only `gh` token cannot post the comments. Say that in the summary and do not pretend the review was published.
