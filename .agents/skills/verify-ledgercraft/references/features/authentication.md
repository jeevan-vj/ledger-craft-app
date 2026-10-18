# Authentication verification

Prerequisites: disposable local database, migrated API, Vite proxy, synthetic accounts.

1. Confirm /api/healthz and /api/readyz report healthy.
2. Confirm unauthenticated /api/me returns 401 with standard error envelope.
3. Sign up/sign in through Better Auth using a synthetic user.
4. Confirm /api/me identifies the signed-in user and organisation.
5. Confirm protected invoices/customers pages reject anonymous navigation.
6. Sign out and verify access is revoked.
7. Test a second organisation cannot access the first organisation's data.

Evidence: HTTP status/assertion results, session-isolation test, Playwright trace on failure. Do not persist credentials in logs.
