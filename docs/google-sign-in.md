# Google sign-in

Google sign-in uses one OAuth **Web** client and Better Auth. Web and mobile both finish on that client. There is no Android or iOS OAuth client and no SHA-1 fingerprint.

The button is hidden unless both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. A missing value does not crash the API. `POST /api/auth/sign-in/social` then returns `GOOGLE_SIGN_IN_DISABLED` with the message "Google sign-in is not configured." `GET /api/auth/providers` returns `{ "google": false }`.

## Redirect URIs

Register these on the Web client:

| Environment | Redirect URI |
| --- | --- |
| Production | `https://easybiz.iamjeevan.com/api/auth/callback/google` |
| Wrangler dev | `http://localhost:8787/api/auth/callback/google` |

The redirect URI is `${BETTER_AUTH_URL}/api/auth/callback/google`. Production `BETTER_AUTH_URL` is `https://easybiz.iamjeevan.com`. The Vite dev server uses `http://localhost:8080`, so a local Vite trial needs `http://localhost:8080/api/auth/callback/google` on the same client.

Trusted origins already include `https://ledger-craft-app.pages.dev` and `easybizinvoice://`. The session cookie is set on the host that serves the callback. Use `https://easybiz.iamjeevan.com` for the web button.

## Worker secrets

Set both secrets on `ledgercraft-api`. Do not put them in `wrangler.jsonc` `vars` or a frontend env file.

```bash
cd deploy/api
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Local Node reads the same names from the environment. See `.env.example`.

## Account linking

Google is a trusted provider only when the ID token says `email_verified: true`. A verified Google email links to an existing email/password user and does not create a second organisation. An unverified Google email does not link and does not create a user. New verified Google users go through the existing organisation hook and then normal onboarding.

Password sign-up does not require a local verification email. Linking therefore accepts Google's verified-email claim for that existing user. A person who registers a password for an email they do not control could receive that mailbox's later Google sign-in. Do not turn on linking for any provider that does not assert a verified email.

## Mobile

The app opens the system browser on Better Auth's `/api/auth/expo-authorization-proxy`, using the same Web client. Google returns to `easybizinvoice://auth/google`, and the app stores the session cookie it already uses for email sign-in. This uses `expo-linking`, which is already in the Expo SDK 54 binary. It does not add `expo-web-browser` or another native module, so a new EAS build is not required for this change.

## Rotation

1. Create a new client secret in Google Cloud, or a new Web client with the same redirect URIs.
2. Put the new values with `wrangler secret put` for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. Redeploy the Worker so the Identity object reads the new secret.
4. Delete the old secret in Google Cloud after a sign-in succeeds.

Leave either secret unset to disable the button without a schema change. No database migration is required. `auth_accounts` already stores provider accounts.

Social sign-in is limited to 10 requests per 60 seconds per client. The mobile browser handoff is limited to 20 requests per 60 seconds.
