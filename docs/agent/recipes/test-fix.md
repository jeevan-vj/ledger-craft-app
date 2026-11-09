# Recipe: test fix

1. Name the failing command and the assertion. Run that file with `docs/agent/TEST_MATRIX.md` so the runner reports one file. If the report says more files, stop; the filter did not apply.
2. Write or adjust the test so it fails on the unfixed code for the reported reason (`ledgercraft-tdd`). Do not delete the assertion, loosen the expected amount, or update a snapshot to match the new output with no behaviour check.
3. Calendar dates stay `YYYY-MM-DD` in the business zone. Chart anchors use the local-noon expression already in `src/pages/AccountingDashboardPage.tsx`. Receipt days are covered by `src/components/payment/PaymentForm.date.test.tsx`. Do not “fix” a date by calling `toISOString()`.
4. Money expectations are decimal strings. Compare through the existing helpers. Do not expect a JavaScript number for a stored total.
5. Re-run the same scoped command. Then run the CI job that owns that package once, on the right Node major.
6. Record the head SHA, Node version, exit code, file count, and log path. The full CI table in `ledgercraft-verify` is still required on the pull request.

A test-only change can still be `risk:high` when it edits `ledgercraft-invariants`, the verify skill, or a money calculation. The path list is `docs/PIPELINE.md`.
