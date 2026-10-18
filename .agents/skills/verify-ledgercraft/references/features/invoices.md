# Invoice verification

Prerequisites: authenticated synthetic user and customer, isolated local database.

1. Open invoice creation. Use existing `ledgercraft-verify-ui` selectors.
2. Add items with GST and fractional values; assert server-calculated totals.
3. Save and reload. Confirm persisted values through the Hono API.
4. Attempt client-supplied total override and confirm rejection/ignored override.
5. Verify duplicate create idempotency and transaction rollback using integration tests.
6. Preview and download PDF; verify magic bytes, file size and visually compare amounts.
7. Confirm another organisation cannot access the invoice.

Evidence: assertion report, API result, PDF artifact and failure screenshots. Never count mocked persistence as integration proof.
