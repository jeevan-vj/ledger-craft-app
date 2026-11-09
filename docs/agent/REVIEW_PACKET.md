# Review packet

The reviewer checks this against the diff. It is not author approval.

```text
PR:
Base SHA:
Head SHA:
Last reviewed SHA: (empty on the first review; the delta base after that)
Changed files:
Acceptance: criterion → file
Commands, Node version, exit code, file count, log path:
Known limits: device-qa-pending | EMAIL_UNAVAILABLE | no deploy | …
Artifact paths:
Risk label and why:
```

Re-review only `last reviewed SHA..head`. The verdict’s `Reviewed` line names that range. Cap and verdict shape stay in `docs/PIPELINE.md` and `ledgercraft-reviewer`. Two delta rounds, then stop.
