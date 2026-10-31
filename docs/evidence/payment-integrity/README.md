# Invoice payment integrity proof

Run from the repository root:

```bash
bash scripts/payment-integrity-browser-proof.sh
```

The script uses a fresh temporary SQLite database and synthetic customer data.
It records two instalments, proves an overpayment is rejected, reverses one
instalment through the web UI, and checks the persisted invoice, payment, source
journal, and equal opposite journal before deleting the temporary database.

- `01-partial-payments-desktop.png` — two completed instalments.
- `02-reversal-confirmation-desktop.png` — explicit reason/date confirmation.
- `03-reversed-payment-desktop.png` — preserved source payment marked reversed.
- `04-reversed-payment-mobile-web.png` — responsive payment cards and reversal reason.
- `e2e-api-output.txt` — API and exact-money journal assertions from the run.

Native mobile proof is automated component coverage, strict TypeScript, lint,
and the successful iOS/Android Expo production export. Authenticated physical
device QA is not represented by these web screenshots.
