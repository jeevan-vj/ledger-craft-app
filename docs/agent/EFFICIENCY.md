# Efficiency measurement

This tooling reads transcripts the coordinator already exported. It does not call a model, start an agent, or add a telemetry service. It is not wired into `.github/workflows/ci.yml`.

## What the coordinator supplies

Place JSONL outside the repository, for example `/tmp/agent-transcripts/`. Each line is one JSON object. A file may instead be a JSON object `{ "manifest": {}, "events": [] }` or a JSON array of events. Do not commit those files. `docs/agent/transcripts/` and `*.transcript.jsonl` are gitignored.

A line the 2026-11-09 audit could parse looks like:

```json
{"role":"tool","tool_name":"read_file","tool_args":{"target_file":"api/src/app.ts"},"tool_result":"..."}
```

Optional fields, used only when present: `usage.input_tokens`, `usage.output_tokens`, `usage.cached_tokens` (cache read), `usage.cache_write_tokens`, `usage.reasoning_tokens`, `usage.cost` or `usage.total_cost_usd`, `usage.cumulative` (`true` or `false`), `usage.id`, `retry`, and `timestamp`. Role, task type, outcome, and commit id come from the manifest or a sibling `<name>.manifest.json`:

```json
{"runId":"bc-example","role":"builder","taskType":"bugfix","outcome":"green","commitId":"<sha>"}
```

`taskType` is `bugfix`, `ui`, `api`, `review`, or `other`. `role` is `builder`, `reviewer`, or `unknown`. Labels that do not match are dropped, not guessed.

## Commands

```bash
node scripts/agent-efficiency.mjs summarize --input /tmp/agent-transcripts/session.jsonl --out /tmp/session-summary.json --csv /tmp/session-summary.csv
node scripts/agent-efficiency.mjs compare --baseline docs/agent/baselines/2026-11-09-sample.json --summary /tmp/session-summary.json --task-type bugfix
```

`--out` must not end in `.jsonl`. The summary is the allowlisted object in `docs/agent/efficiency-summary.schema.json`.

## How numbers are chosen

- Tool calls count `role: "tool"` records, or a record with no role and a tool name. Assistant declarations of the same call are not counted again.
- `callsBeforeFirstEdit` counts tool calls before the first `search_replace`, `StrReplace`, `Write`, `apply_patch`, or `Delete`. A shell redirect is not treated as that edit. A session with no edit, including a read-only review, stores null, not zero.
- `repeatPathReads` counts a later read of the same path, including a different line range. The path list is not written out.
- Broad versus targeted tests use command text. `vitest run -- file` and, unless the package script is `scripts/targeted-test.mjs`, `pnpm test:api -- file` are broad. `vitest run file` is targeted. This heuristic can mis-label a command that does not match those shapes.
- Polling matches `gh pr checks`, `gh run view|watch|list`, `statusCheckRollup`, and `sleep <seconds>`. A single status read counts. It is not a count of HTTP requests.
- Duration is the span of monotonic timestamps. Missing or out-of-order timestamps stay null.
- Usage: no samples → null, not zero. One sample → that sample. `cumulative: true` and a non-decreasing series → the last value. `cumulative: false`, or a decreasing series without that flag → the sum. A non-decreasing series with no flag, a decreasing series marked cumulative, or mixed flags → null. The same `usage.id` counts once. A `retry` with the same numeric usage as the previous sample is not added again.
- `proxies.toolResultBytes` is the UTF-8 size of serialized tool results. `proxies.transcriptBytes` is the export file size. They overlap. `tokenEquivalentEstimate` is `toolResultBytes / 4`. It is a token-equivalent estimate. It is not tokens spent and not a bill. Provider usage fields are separate and stay null when the export has none.

Compare prints the median of baseline sessions with the same `taskType` and the delta for this summary. Fewer than two baseline peers is not comparable. A negative delta is not a promised saving.

## Baseline

`docs/agent/baselines/2026-11-09-sample.json` and `.csv` are sanitized aggregates from the coordinator-supplied 14-session stats export (3,334 tool calls, 9,441,385 tool-result bytes). Raw transcripts, reasoning, command text, and file paths are not in git. Task types on those rows were assigned from the audit’s task titles. Usage was not in that export and is null. The audit’s byte-share and identical-reread figures were not recomputed here because the raw JSONL was not stored.

Future bugfix, UI, API, and review tasks can be compared with the command above. Do not forecast a percentage saving from a docs or tooling change that has not been measured on a later task of the same type.
