# Payment verification

Prerequisites: synthetic invoice and authenticated local organisation.

1. Record a partial payment; assert remaining balance and persisted allocation.
2. Record final payment; assert outstanding balance reaches zero.
3. Test duplicate submission/idempotency, invalid overpayment and currency precision.
4. Reload and verify ledger/journal consistency through real database tests.
5. Confirm cross-organisation payment access is denied.
6. Exercise the UI happy/error paths if payment screens changed.

Evidence: API responses, financial invariant test IDs, database assertion results, UI failure screenshots.
