# PR integration checks

## Case-insensitive module resolution (#173)

After merging main, macOS Node22 web typechecking exited2 with TS1149/TS1261 and missing component exports; see `close-pack-types-red.log`. `ClosePackDownload.tsx` and `closePackDownload.ts` resolve ambiguously on a case-insensitive filesystem despite passing Linux CI. The helper is renamed to `downloadClosePackArchive.ts`, and the component and test imports/mocks use that name. Download implementation, report permissions and accounting are unchanged. A source-tree scan found no remaining duplicate case-folded module basenames across `.ts`, `.tsx`, `.js` and `.jsx`.

Both web project typechecks exit0 under Node22. The existing close-pack/report-page tests pass11/11 across2 files, exit0; see `close-pack-tests-green.log`.

## Hosted baseline

All seven repository jobs passed on `ced129d993535f96819c3e4e34d245648209d0a6`: https://github.com/jeevan-vj/ledger-craft-app/actions/runs/42464351088. These are Linux results and did not expose the macOS resolution defect. The subsequent `f1b224d` main merge retained the upstream Stripe settlement-date assertion and removed the Stripe-test diff from this PR.

## Private resumable proof output (#162 follow-up)

SonarCloud flagged the default shared temporary directory used by the Expo close proof. It can retain a local session cookie. The driver now requires explicit `CLOSE_OUTPUT`, creates a new directory with mode0700, and rejects existing directories with group/other access, non-owner directories and symlink destinations before reading or writing state. New tests failed before implementation; all6 runtime tests pass afterward, exit0 under Node22. See `private-output-red.log` and `private-output-green.log`. This addresses the actionable finding without claiming to resolve SonarCloud's unexplained cancelled analysis status.

## Additional local results

Contracts:47 files/167 tests passed, and API/contracts typechecks exit0 (Node24). Mobile lint:0 errors/74 warnings, exit0; TypeScript exit0. Initial mobile Jest:670 passed/4 timed out across3 files, exit1; complete reruns of those3 files pass37/37 with one worker and unchanged10-second timeouts, exit0. Combined mobile coverage:674/674. iOS export exits0 and writes `/tmp/ledgercraft-pr-expo-ios` (Node20). The serialized full API run passes626/626 across143 files, exit0 (Node24), with all25 feature groups passing in `api-feature-results.md`. The earlier contention failures remain separate attempts and are not relabelled as successful.

All seven hosted repository CI jobs passed on `77f47024932e56133c0820a3c6ae17246723d420`: https://github.com/jeevan-vj/ledger-craft-app/actions/runs/42465933640. SonarCloud remained cancelled without a reported cause; its50 surfaced annotations were warnings, with no failure-level annotation after private output hardening.

Hosted output for that exact head: web173 files/885 tests, API143 files/626 tests, contracts47 files/167 tests, mobile150 suites/674 tests; all exit0. Web lint0 errors/120 warnings; mobile lint0 errors/74 warnings. Web app/Node, API/contracts and mobile typechecks, web build with version verification, readiness checks and iOS export all passed.
