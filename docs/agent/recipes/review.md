# Recipe: review

The checklist and verdict wording are `ledgercraft-reviewer`. The loop is the Review loop section of `docs/PIPELINE.md`. This page is the packet shape. It does not add a third re-review round or a path around independent review.

1. Review from a session that did not write the change. Read the diff against the base, the acceptance criteria, and the invariants the diff can touch. Do not tour the whole app.
2. Use `docs/agent/REVIEW_PACKET.md`. The packet is a claim. Check it against the code.
3. On a revision, review `last-reviewed-sha..head`. Stop after two delta rounds and escalate. The same builder pushes the fixes when that session can continue.
4. Do not merge, approve with `gh pr review --approve`, or apply `auto-merge-eligible` unless every stage-6 condition already holds and you are not the author. The author does not apply `review-passed`.
5. A read-only review has no first edit. Efficiency summaries leave `callsBeforeFirstEdit` null in that case. That null is not a zero.

Batch comments into one review. If the token cannot post them, say so. Do not poll CI in a loop; name the head SHA and the checks you actually read.
