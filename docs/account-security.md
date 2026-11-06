# Account recovery and session security

LedgerCraft uses Better Auth as its only identity and session system. Reset and
verification mail uses the existing server-side Resend configuration
(`RESEND_API_KEY` and `RESEND_FROM`); neither value is exposed to a client.

## Policy

- Password-reset requests always return the same success message for known and
  unknown addresses. A reset token is random, single-use, expires after one
  hour, and a successful reset revokes every cookie and bearer session.
- Signup sends verification mail when delivery is configured, but an unverified
  account is not locked out. This avoids making existing access depend on email
  delivery before that delivery has been proven in production.
- An email change never activates immediately. The old address remains active
  until the new address completes Better Auth verification. Verification links
  expire after 24 hours.
- A password change verifies the current password, replaces the current
  session, and revokes every other session. “Sign out other devices” preserves
  the current session; “Sign out everywhere” includes it.
- Login, signup, verification, password-reset request, and reset submission are
  rate limited by client IP in the Identity Durable Object, independent of any
  organisation membership. Counters are stored in the Identity SQLite database
  by migration `0024_auth-rate-limits.sql`, so object eviction does not reset
  the window.
- Recovery callbacks are restricted by Better Auth trusted origins. Production
  clients use `https://easybiz.iamjeevan.com/reset-password` or
  `easybizinvoice://reset-password`.
- Sentry and application logging remove request bodies, email addresses,
  cookies, authorization headers, reset/verification query values, and reset
  tokens embedded in paths.

## Release-only verification still required

Deployment, secret changes, and production email were deliberately not run as
part of issue #144. After the reviewed change is deployed, use an authorized
synthetic account to verify one delivered reset email, successful reset, token
replay rejection, and 401 responses from a pre-reset cookie and bearer token.
Run the installed Android and iOS flows against that deployment and record the
build/runtime identifiers. Local production exports passed for both Android and
iOS on 2026-11-06, but authenticated browser proof, installed-device deep-link
proof, and production inbox proof remain pending. Do not use a real customer
account.
