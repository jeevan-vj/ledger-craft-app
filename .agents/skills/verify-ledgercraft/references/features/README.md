# LedgerCraft feature map

These references are **verification recipes**, not a claim that every flow currently works. Confirm routes/selectors against the running app and update the reference with the same PR when the behavior changes.

| Feature | Reference | Evidence |
| --- | --- | --- |
| Authentication | authentication.md | Real session, /api/me, protected route |
| Invoices | invoices.md | Server totals, persistence, PDF |
| Payments | payments.md | Allocation, balances, persistence |

Use isolated local PostgreSQL, API port 3001 and Vite port 8080. Existing `.cursor/skills/ledgercraft-verify-ui/SKILL.md` has verified selectors and PDF caveats.
