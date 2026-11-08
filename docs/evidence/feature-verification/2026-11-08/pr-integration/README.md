# PR integration checks

## Case-insensitive module resolution (#173)

After merging main, macOS Node22 web typechecking exited2 with TS1149/TS1261 and missing component exports; see `close-pack-types-red.log`. `ClosePackDownload.tsx` and `closePackDownload.ts` resolve ambiguously on a case-insensitive filesystem despite passing Linux CI. The helper is renamed to `downloadClosePackArchive.ts`, and the component and test imports/mocks use that name. Download implementation, report permissions and accounting are unchanged. A source-tree scan found no remaining duplicate case-folded module basenames across `.ts`, `.tsx`, `.js` and `.jsx`.

Both web project typechecks and existing close-pack/report-page tests are being rerun. No green result is claimed here until their logs are recorded.

## Hosted baseline

All seven repository jobs passed on `ced129d993535f96819c3e4e34d245648209d0a6`: https://github.com/jeevan-vj/ledger-craft-app/actions/runs/42464351088. These are Linux results and did not expose the macOS resolution defect. The subsequent `f1b224d` main merge retained the upstream Stripe settlement-date assertion and removed the Stripe-test diff from this PR.
