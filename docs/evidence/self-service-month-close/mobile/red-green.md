# Mobile TDD evidence

Feature tests were first run while their implementation modules were absent. Chart, period and authenticated ZIP tests failed, then passed after implementation. Further regressions reproduced org-scoped forms, lost-response chart retries and insufficient close-pack permissions before their fixes.

- Chart retry red: 3 failed / 3 passed; green: chart 6 plus period 4 pass. Tests retain the exact original request body/key after uncertain failure and remount.
- Period red: missing component; company-scope green: 8 tests passed across chart/period before subsequent retry additions. Final full suite includes owner reopen, server revision, stale-conflict refresh, capability enforcement and reviewed reasons.
- ZIP red: missing download/share modules; final report permission red: 1 failed / 10 passed, then 11 passed. Transport/native sharing tests verify ZIP bytes, MIME, date validation and honest unavailable sharing without private fetch.
- Final repository mobile Jest run: 150 suites / 674 tests pass. Production source remained frozen through end-to-end verification; subsequent import ordering changed only a test file, whose 11 tests were rerun.

Logs under `checks/` retain actual red/green output. Empty TypeScript log indicates successful zero-diagnostic execution; bundle logs are compilation evidence, not installed native QA.
