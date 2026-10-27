# Mobile crash reporting

The Expo app reports native crashes and JavaScript errors to Sentry with
`@sentry/react-native` 7.2.0, the release Expo SDK 54 installs.

The Sentry organization is `ledgercraft` in the US region. The project slug is
`ledgercraft-mobile`. Preview and production builds in `eas.json` already set
the public client DSN (`EXPO_PUBLIC_SENTRY_DSN`) and `SENTRY_ORG=ledgercraft`,
so those builds report without anyone running `eas env:create` for the DSN.
The DSN is a public client key. It is not an auth token.

These stay off, with no DSN inlined:

- `development` and `development-device` EAS profiles
- Local `expo start` and a local `.env`
- Jest
- CI `npx expo export`

`app.config.js` points the Expo plugin at `https://us.sentry.io/` so a later
source-map upload reaches the US organization.

## What gets recorded

- Native crashes and uncaught JavaScript errors.
- Render crashes, which also show a retry screen.
- Screen transitions from React Navigation.
- Failed API calls when the network fails or the server returns 500 or higher.
  Those events carry a `requestId` tag that matches the API log for the same
  call. Ordinary 4xx responses, including a wrong password, are not reported.
- The signed-in user, as an id only.

These stay off:

- Session Replay.
- Default personal data (`sendDefaultPii`).
- Request and response bodies, cookies, `Authorization`, `Cookie`,
  `set-auth-token`, and other auth headers.
- Console breadcrumbs that dump a whole error object or a server message.
- Share tokens in `/shared/invoice/…` and `/api/public/invoices/…` links.

Tracing is sampled at 10%. Release and dist follow the installed app:
`com.easybizinvoice.app@<version>+<build>`, with dist set to the build number.
On a real build those values come from the native version and build number.

## Optional source map upload

Preview and production builds compile and report crashes without
`SENTRY_AUTH_TOKEN`. That token is only for uploading source maps and debug
symbols. Create one at
[Sentry auth tokens](https://us.sentry.io/settings/account/api/auth-tokens/)
with the `project:releases` and `org:read` scopes. Do not commit it.

From `mobile/`, on the `jnok` Expo account that owns project `@jnok/easybizinvoice`
(`6bb662da-bb2f-405d-876f-cea471908f74`):

```bash
eas env:create --name SENTRY_AUTH_TOKEN --value "<token>" --visibility secret --environment preview --environment production
```

`SENTRY_PROJECT=ledgercraft-mobile` is already set on every EAS build profile.
Leave `EXPO_PUBLIC_SENTRY_DSN` unset in `mobile/.env`.

## Source maps

`app.config.js` includes the `@sentry/react-native/expo` plugin.
`metro.config.js` uses `getSentryExpoConfig`, then NativeWind's
`withNativeWind`, so bundles get a Sentry debug id. During an EAS build the
plugin uploads source maps and iOS/Android debug symbols when the token above
is present.

A preview or production build without that token still compiles: the iOS
build phase and the Android Gradle hook skip the upload. CI sets
`SENTRY_DISABLE_AUTO_UPLOAD=true` on `npx expo export --platform ios` so that
step never tries to upload.

`app.json` is not the config Expo uses. Plugins live in `app.config.js`.

## Check a preview build

Expo Go cannot prove native crashes or symbolicated release stacks. The
preview profile already includes the DSN:

```bash
cd mobile
eas build --platform ios --profile preview
```

Install that build. Temporarily add a button that is not shipped in production:

```tsx
import * as Sentry from '@sentry/react-native';

Sentry.captureException(new Error('Sentry preview test'));
```

Confirm the issue arrives in the `ledgercraft-mobile` project, the release
looks like `com.easybizinvoice.app@1.0.0+<build>`, and the stack points at
your source file rather than a minified bundle. Without `SENTRY_AUTH_TOKEN`
the event still arrives, and the stack stays minified until that optional
secret is added and a new build uploads symbols. Then try a native crash from
a second temporary button and reinstall afterwards, because the app will close:

```tsx
Sentry.nativeCrash();
```

Remove both buttons before the next production build.

To check the API link, trigger a server 500 while signed in and confirm the
mobile event's `requestId` tag matches the API event for that call. A shared
invoice URL in the event should show `/shared/invoice/[redacted]` rather than
the token.

## What a device build still has to prove

These cannot be confirmed from Jest or `expo export`:

- A native crash is delivered from a TestFlight or internal build.
- The uploaded source map and dSYM or ProGuard file symbolicate that crash.
- The release name on the event matches the uploaded artifacts.
- React Navigation transactions appear for a real screen change.
- An API `requestId` on a phone lines up with the API project's event.
