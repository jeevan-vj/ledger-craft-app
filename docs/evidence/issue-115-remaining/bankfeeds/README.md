# Akahu staged bank feeds (#108)

Local implementation, 7 November2026 (Pacific/Auckland). This is a gated internal
**Personal App** integration, not a public Full App release or accreditation.
No real bank account, provider secret or external revocation was used for tests.

## Implemented

- Server-only App ID/User Token and explicit configured owner/company binding;
  global unscoped tokens and placeholder credentials are rejected. Client DTOs
  contain connection/account status, never credentials or provider payloads.
- HTTPS adapter for account information, date-window/cursor transaction reads
  and token revocation. Numeric JSON amount lexemes are preserved as decimal
  strings before decoding; no money passes through JavaScript floating-point
  arithmetic. Provider401 marks the connection revoked and stops future runs.
  Provider errors are generic and cannot echo malformed secret-bearing payloads.
- Account mapping reuses an unambiguous same-company account number, otherwise
  creates an NZD statement account. Ambiguous mappings and unsupported currencies
  require review. Provider balances never overwrite posted books or invent a
  reviewed opening balance.
- External transaction IDs provide idempotence. New lines use existing statement
  import/posting and reconciliation paths with source`feed`; existing imported
  CSV duplicates can be linked once. Distinct real provider IDs with identical
  financial facts stay separate. Changed historical facts fail closed rather
  than rewriting original accounting records.
- One-hour refresh rest period and daily job entry point. Success schedules the
  next daily alarm; failed attempts retain their timestamp to prevent a retry
  storm. The scheduler resolves the configured company by verified membership,
  independent of the owner's active-company selection; its optional trusted
  authorizer checks current Identity access before provider credentials are used.
- Disconnect invokes tokenDELETE and requires acknowledgement; accounting
  records remain intact. The trusted Identity pre-delete hook binds the deletion
  user to the configured token owner and revokes access even after that owner's
  company membership has been removed. Only this hook bypasses membership; it
  purges metadata for the configured company alone and retains financial books.
  Interactive and scheduled sync retain membership checks. The Worker must invoke that hook against the configured LedgerDB,
  not an unrelated IdentityDB; parent integration records its final wiring.
- Web summary, explicit refresh/disconnect confirmation and inactive-account
  warnings; mobile read-only summary. Full App enrollment/management is visibly
  unavailable rather than a fake OAuth link. No new native dependency was added.

## Migration

`0030_akahu-personal-bank-feeds.sql` adds three tables generated with isolated
Drizzle metadata (`/tmp/issue115-bankfeeds-drizzle`). The actual applied schema
uses migration0008 source-validation **triggers**, despite the old specification
calling them a CHECK constraint. The new migration replaces only those two
triggers to allow`feed`; no bank/child table rebuild, drop or financial-row rewrite
is needed. A seeded SQLite test applies it with foreign keys ON inside a
savepoint and proves original bank, split, attachment and reconciliation rows
are unchanged, foreign-key checks pass and unsupported sources remain rejected.
Existing migration files are untouched.

## Verification

Test-first logs include absent-module red captures and behavioral red/green
cases for identical transactions, legacy CSV multiplicity, active-company
switches, deletion metadata, placeholder configuration, provider-payload error
redaction and acknowledged revocation. These are contract/HTTP fixtures, not
proof that Akahu accepted a real request.

API tests use actual SQLite. The authenticated Hono test signs up through Better
Auth and supplies the provider only at the HTTP boundary: unauthenticated401,
sync200, next alarm scheduling, Full App503, read-only GET200 and mutation403,
with no fixture tokens in returned JSON. Independent amounts1150.23 credit and
0.10 debit are retained exactly. Repeating the same provider IDs adds no rows.
The migrated source is`feed`, while already imported legacy rows stay`import`.

Final scoped results: API **4 files/18 tests passed**, contracts **2 passed**,
web **3 passed**, mobile **2 passed**. The initial API project and web app TypeScript checks exited0; scoped ESLint
exited0 with no errors or warnings. After the bounded deletion/authorizer change,
the complete bank-feed folder passed18 tests and a focused TypeScript project
check passed; concurrent unrelated Stripe test work temporarily prevents the
combined API type gate, which the parent owns. The red regressions prove that
removed company membership no longer blocks trusted account-deletion revocation,
and a denied live daily authorizer makes no provider request or financial write. Node majors matched API24,
web22 and mobile20. Mobile project TypeScript was also checked; concurrent unrelated
mobile feature type errors is handed to the parent for the combined
gate. Own mobile component's ES target issue was fixed and rechecked. See the
retained logs; initial red runs are not passes. Browser screenshots belong to
the parent coordinated build after source freeze. Reproduce the unavailable-capability web proof
with `node scripts/issue115-bankfeeds-proof.mjs` on the local authenticated stack.
It verifies 1440×900 and390×844 without pretending provider configuration exists.
Mobile browser evidence belongs to the coordinated banking walkthrough.

## Remaining owner/release requirements

- Apply permitted HTTPS access to`api.akahu.io`; configure Worker secrets
  `AKAHU_APP_ID` and `AKAHU_USER_TOKEN`, plus explicit `AKAHU_ORGANISATION_ID`
  and `AKAHU_USER_ID`. Run a real owner-authorized Personal App sync and verify
  account mapping, real bank statements, daily cadence and revocation.
- Full App OAuth/state/token encryption, authorisation-level disconnect, Manage
  accounts and externally verified TOKEN DELETE webhook handling remain gated.
  The current implementation stores no user token in SQLite and does not invent
  an unverified webhook-signature scheme or present a partial OAuth flow as safe.
- Obtain Akahu Tier2 contract/due diligence, approved consumer information and
  logo, reviewed privacy/retention copy, provider OAuth/webhook specifications,
  TestFlight/APK/web review and a native PIN/biometric app lock before enabling
  multi-user Full App connections. Native lock/background and store acceptance
  cannot be inferred from Expo browser tests.
- Retaining imported accounting records is explicit. Selective deletion of
  genuine accounting history after disconnect is not offered by this internal
  phase; a reviewed retention/deletion policy is required for public enrollment.

Issue108 is therefore **partially implemented with local verification**, not
closed or certified. No payments, live bank matching, deployment or Akahu
accreditation is claimed.
