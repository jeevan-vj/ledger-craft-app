# Mobile crash reporting

The Expo app reports native crashes and JavaScript errors to Sentry with
`@sentry/react-native` 7.2.0, the release Expo SDK 54 installs. Nothing is sent
until `EXPO_PUBLIC_SENTRY_DSN` is set. Local development, Jest, and the iOS
`expo export` in CI stay quiet without a DSN or an auth token.

The Sentry project slug is `ledgercraft-mobile`. The organization slug is
whatever org you create the project in.

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

## One-time Sentry setup

1. In Sentry, create a project named `ledgercraft-mobile` and choose React Native.
2. Copy the client DSN.
3. Create an auth token at [Sentry auth tokens](https://sentry.io/settings/account/api/auth-tokens/)
   with the `project:releases` and `org:read` scopes. This token uploads source
   maps and debug symbols. It is not the DSN, and it must not be committed.

From `mobile/`, store them as EAS environment variables. Use the Expo account
that owns project `7148323b-502c-447e-96c3-a5c1704c40c9`.

```bash
cd mobile
eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value "<dsn>" --visibility plaintext --environment preview --environment production
eas env:create --name SENTRY_ORG --value "<org-slug>" --visibility plaintext --environment preview --environment production
eas env:create --name SENTRY_AUTH_TOKEN --value "<token>" --visibility secret --environment preview --environment production
```

`SENTRY_PROJECT=ledgercraft-mobile` is already set on the EAS build profiles in
`eas.json`. Add the same `SENTRY_ORG` and `SENTRY_AUTH_TOKEN` variables to the
`development` environment if you want symbol uploads from development-client
builds.

For a local release build, put the DSN in `mobile/.env` (this file is gitignored):

```bash
EXPO_PUBLIC_SENTRY_DSN=https://<public-key>@o<org-id>.ingest.sentry.io/<project-id>
```

Do not put `SENTRY_AUTH_TOKEN` in `mobile/.env` if that file is shared. Expo
also reads it from the environment during an EAS or local native build.

## Source maps

`app.config.js` includes the `@sentry/react-native/expo` plugin.
`metro.config.js` uses `getSentryExpoConfig`, then NativeWind's
`withNativeWind`, so bundles get a Sentry debug id. During an EAS build the
plugin uploads source maps and iOS/Android debug symbols.

The upload runs only when `SENTRY_AUTH_TOKEN` is present. A preview or
production build without that token still compiles: the iOS build phase and
the Android Gradle hook skip the upload. CI sets `SENTRY_DISABLE_AUTO_UPLOAD=true`
on `npx expo export --platform ios` so that step never tries to upload.

`app.json` is not the config Expo uses. Plugins live in `app.config.js`.

## Check a preview build

Expo Go cannot prove native crashes or symbolicated release stacks. Use an
internal preview build after the three environment variables above exist:

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
your source file rather than a minified bundle. Then try a native crash from
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
