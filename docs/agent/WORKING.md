# Working without a context flood

This is how to execute a task. It does not replace `docs/PIPELINE.md`, `ledgercraft-verify`, or `ledgercraft-invariants`.

## Route, then read a range

1. Take the domain row from `docs/agent/CODEMAP.md`.
2. Search inside that directory for the symbol you need. Set a small result limit.
3. Read the matching line range. Do not read `AGENTS.md`, `TARGET_ARCHITECTURE.md`, a migration, or a diff from the first byte when a range will do.
4. If a search or log is large, write it to a file outside the repository and read the matching lines or the summary. The targeted-test wrapper does this for a scoped run: it prints the file count and the log path.

A suggested checkpoint: after 20 read or search calls without an entry point from the map, stop and say what is missing. That number is not a gate and not a reason to edit auth or money before the boundary is clear. Repeated reads of the same path can be a new range or a real change. The problem to avoid is an unbounded first search.

## Tests during the change

Reproduce with the scoped command in `docs/agent/TEST_MATRIX.md`. Run that file again after the fix. Run the full CI jobs once per head you are ready to show, not between every comment. `ledgercraft-verify` is still the required set before a pull request. A scoped pass does not replace it.

When the edit is finished, run `node scripts/books-flow-check.mjs --run`. That is the bookkeeper path from signup through a paid invoice and a GST receipt. It starts only when a changed file is on that path.

Keep long command output in the log file. Record the command, Node version, exit code, file count, and log path.

## Review and follow-up

The only review loop is the Review loop section of `docs/PIPELINE.md`.

- The same builder applies review fixes when that session can continue.
- The reviewer re-reviews the delta since the last reviewed commit, at most two delta rounds, then a person takes over.
- Batch findings into one verdict. Batch the fixes. Do not open a fresh full-app review after each push.
- CI in `.github/workflows/ci.yml` stays required, including zero lint and typecheck errors. Do not poll it in a sleep loop. One status read for the head SHA is a summary. Green CI is still required before `review-passed`. This file does not change that gate.

## Not in this change

The November 2026 audit also described risk-tiered local verification and a smaller reviewer for cosmetic work. Those would change mandatory gates. They are not implemented. Independent review and the current CI jobs stay for every pull request.
