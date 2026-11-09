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

Google is a trusted provider only when the ID token signature checks out against Google's JWKS and `email_verified` is true. A verified Google email links to an existing password user and does not create a second organisation. An unverified Google email does not link and does not create a user. New verified Google users go through the existing organisation hook and then normal onboarding.

If that existing password user has not verified the email, linking removes the password and every session that existed before Google proved the mailbox. The Google session is the only one left. A user whose email is already verified keeps the password.

A Google-only account can set a password with the normal reset email, then delete the account with that password. A pending email change is not used as the Google link key.

## Mobile

The app stores a random state and verifier for two minutes, then opens the system browser on `/api/auth/google/browser`. That proxy accepts only a Google authorize URL whose redirect is this API's Google callback. Google returns to `easybizinvoice://auth/google` with a one-time code and the same state, or with Google's own error (for example `access_denied`) and that state. A closed browser does not delete the pending verifier; a later return can still be exchanged until the two minutes are up. The app checks the state, then exchanges the code and verifier over HTTPS and stores the session the same way email sign-in does. The return URL does not contain the session cookie. In production the exchanged session cookie is `Secure`, the same as the other session cookies. This uses `expo-linking`, which is already in the Expo SDK 54 binary. It does not add `expo-web-browser` or another native module, so a new EAS build is not required for this change.

## Rotation

1. Create a new client secret in Google Cloud, or a new Web client with the same redirect URIs.
2. Put the new values with `wrangler secret put` for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. Redeploy the Worker, or restart the Identity object, so it reads the new secret. Removing either secret disables Google on the next Identity startup.
4. Delete the old secret in Google Cloud after a sign-in succeeds.

Leave either secret unset to disable the button without a schema change. No database migration is required. `auth_accounts` already stores provider accounts.

Social sign-in is limited to 10 requests per 60 seconds per client. The mobile browser handoff is limited to 20 requests per 60 seconds.
