# Akaunting core parity gate

`docs/akaunting-core-capabilities.json` is the machine-readable contract for the
25 rows in the core comparison table in `AKAUNTING_FEATURE_PARITY_BACKLOG.md`.
The manifest keeps optional Akaunting modules in a separate `extensions` array;
extensions never satisfy or block the core contract.

## Commands

```bash
pnpm verify:akaunting-core:report
pnpm verify:akaunting-core
pnpm test:akaunting-core
```

Report mode validates the manifest, evidence paths, pinned baseline, and exact
comparison-row inventory. It reports open required capabilities but exits zero,
so normal CI can expose progress while planned work remains open. Invalid or
drifted manifests still fail report mode.

Strict mode is the release-enforcement command. It exits non-zero while any
required core capability is `partial` or `missing`. A core capability may move
to `available` only when the mapped contract, API integration, web proof, and
relevant mobile proof honestly cover its acceptance criteria. The validator
also exits non-zero if evidence points to a file that does not exist.

Exit codes are stable:

- `0`: the selected mode passed;
- `1`: invalid manifest, or open core blockers in strict mode;
- `2`: command usage or manifest loading failed.

## Updating the Akaunting baseline

Baseline updates are review work, not an automated dependency bump.

1. Fetch the proposed upstream commit without changing this repository's
   working tree, and record its full 40-character SHA.
2. Compare that commit with the currently pinned SHA, concentrating on
   Akaunting core admin/API routes, default navigation, and the source pages
   linked from the backlog. Do not treat marketplace modules as core.
3. Classify each upstream difference as a changed existing core capability, a
   new core comparison row, an optional extension, or no product impact.
4. Update the backlog comparison table first. Then update
   `EXPECTED_CORE_CAPABILITY_IDS` and the manifest in the same pull request.
   New required scope must not appear only in the JSON file.
5. Update `baseline.commit`, `baseline.reviewedAt`, evidence mappings, gaps, and
   extension decisions. Never promote a capability from file presence alone.
6. Run the manifest tests and report mode. Record the strict result even when
   it is expected to fail because planned parity work is still open.
7. Request human review for any scope expansion or exclusion. The pinned SHA
   changes only after that review; upstream movement never expands the release
   promise silently.

The current baseline remains `akaunting/akaunting` commit
`edde6b54f27ee0635b9a5dbde52117d441a18195`, reviewed on 2026-09-29.
