# Remote updates

The SDK 54 app uses `expo-updates` with EAS project
`7148323b-502c-447e-96c3-a5c1704c40c9`. The dynamic `app.config.js` is authoritative:
updates use `https://u.expo.dev/7148323b-502c-447e-96c3-a5c1704c40c9`, and the runtime
version follows `expo.version` (`appVersion` policy).

## One-time rollout

Existing binaries built without `expo-updates` cannot receive OTA updates. After
merging, create and install a new preview build, then ship a new production build
through the existing store release process. Check the latest store build number
before building; this PR does not bump or submit a store version.

From `mobile/`:

```sh
npx --yes eas-cli@latest build --profile preview --platform ios
# Or --platform android. iOS internal distribution needs registered devices.
```

`preview` builds subscribe to the `preview` channel and EAS environment;
`production` builds subscribe to `production`. Development clients retain their
normal development workflow. Both release environments currently use the live
LedgerCraft API, so preview is not a separate backend sandbox.

## Publish a compatible change

Run mobile lint, TypeScript, Jest and platform exports before publishing. Commit
and review the exact changes to publish. From `mobile/`:

```sh
npm run update:preview -- --message "Describe the fix"
# Verify on the installed preview binary before publishing production.
npm run update:production -- --message "Describe the verified fix"
```

These commands publish both iOS and Android bundles using explicitly selected
EAS environments. They do not build or submit a store binary. EAS Update does
not inherit `build.<profile>.env` from `eas.json`: keep `EXPO_PUBLIC_API_URL`,
`EXPO_PUBLIC_APP_ORIGIN`, and `EXPO_PUBLIC_SENTRY_DSN` in the matching EAS
environments. Check them with `npx --yes eas-cli@latest env:list --environment
production` (or `preview`). Never put secrets in `EXPO_PUBLIC_*` variables.
The optional Sentry source-map upload needs a locally available Sentry token;
the EAS builder-only secret is not available to local update exports.

JavaScript, styling and bundled assets can update without a store release.
When changing native dependencies, Expo SDK, permissions, entitlements or native
configuration, bump `expo.version` in BOTH `app.config.js` and `app.json`, then
build and distribute new binaries. Do not publish native-dependent JavaScript
to the old runtime. Increasing only an iOS build number or Android version code
does not change an `appVersion` runtime.

## Device verification and recovery

The default update behavior checks on cold launch, downloads in the background,
and applies on a subsequent restart. It does not reload during invoice editing.
Fully close and reopen the release app, allow time for download, then fully
close and reopen again. Verify the visible change, login, API reads/writes and
an offline relaunch. Expo Go and development-client checks do not prove the
release startup flow.

Confirm the published group in EAS matches the build's project, channel, runtime
and platform. Record the group ID, build ID and device result with release
evidence. Native-device OTA delivery has not been verified by this configuration
PR, and no update is published as part of it.

If a published update regresses, use the EAS dashboard to republish a known-good
update for the same runtime, or use `eas update:republish` following its current
`--help`. If necessary, use EAS's rollback-to-embedded flow for the affected
runtime. A Git revert alone does not withdraw an already published update.
Do not disable Expo's anti-bricking measures or bypass runtime compatibility.

References: [setup](https://docs.expo.dev/eas-update/getting-started/),
[runtime versions](https://docs.expo.dev/eas-update/runtime-versions/),
[rollback](https://docs.expo.dev/eas-update/rollbacks/).
