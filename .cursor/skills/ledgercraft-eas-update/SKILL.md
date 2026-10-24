---
name: ledgercraft-eas-update
description: Publish and verify compatible LedgerCraft mobile JavaScript, styling, and asset changes through EAS Update on existing TestFlight or store builds. Use for mobile OTA releases, runtime compatibility checks, update delivery verification, and rollback; route native changes to ledgercraft-mobile-release.
---

# LedgerCraft EAS Update

Use the existing release tooling from `mobile/`. Read `mobile/EAS_UPDATE.md` for
configuration and dated release evidence; do not treat historical build/update IDs
as the current release. This skill documents publishing, not permission to publish:
proceed when the user's request already authorizes the target release. A code-only
or review request does not authorize a production update.

## Choose OTA or a native build

- Use OTA for compatible React/TypeScript behavior, text, styling, and bundled
  assets supported by the installed binary. Backend-only changes deploy separately.
- Native dependencies, Expo SDK, native plugins, permissions, entitlements, app
  icons/splash configuration, and other native configuration require compatibility
  evaluation and usually a new binary via `ledgercraft-mobile-release`.
- The authoritative `app.config.js` uses `runtimeVersion: { policy: 'fingerprint' }`.
  Compare the generated iOS runtime with the intended installed build. Do not force
  a runtime value to make an incompatible update appear compatible.
- OTA does not change TestFlight's marketing version or build number. Do not bump
  `app.json` version/build numbers for a JS-only OTA. Old binaries without
  `expo-updates` need a one-time store/TestFlight upgrade.
- Scope the release to the platforms the user requested and for which compatible
  binaries exist. The tested production cloud workflow publishes iOS only.

## Prepare the exact source

1. Verify the repository remote is `jeevan-vj/ledger-craft-app`, preserve unrelated
   dirty changes, and inspect the intended commit/diff. EAS uploads the working
   tree when no `--ref` is supplied, not merely the recorded Git SHA.
2. Read `mobile/eas.json` for the CLI pin (currently `25.3.0`), channel and environment.
   Use that version explicitly; the older installed CLI can fail under Node 26.
3. Run the mobile checks in `ledgercraft-verify`: lint, TypeScript, relevant tests,
   and native exports; use the full suite when scope warrants it. Use Node 20 to
   match mobile CI. Do not use Expo `--platform all` to validate native-only changes:
   it also exports the Expo web target, which has a native bottom-tabs limitation.
4. Compare runtime fingerprints using the actual target environment:

   ```sh
   npx --yes eas-cli@25.3.0 fingerprint:generate --platform ios --environment production --json --non-interactive
   npx --yes eas-cli@25.3.0 build:view BUILD_ID --json
   ```

   Compare the generated `hash` with build `runtime.version` / `fingerprint.hash`;
   the build channel is `updateChannel.name`. Native archive inspection can confirm
   `Expo.plist` and the embedded `fingerprint` file. Do not infer compatibility from
   matching version strings alone.
5. Commit the verified code. Use a descriptive update message and record the source
   SHA, platform, channel, environment, and runtime with the resulting update IDs.

## Publish through the existing workflow

Production credentials already live in EAS. Run from `mobile/`:

```sh
npx --yes eas-cli@25.3.0 workflow:run .eas/workflows/update-ios-production.yml -F message="Describe the verified change" --non-interactive --json
npx --yes eas-cli@25.3.0 workflow:view WORKFLOW_ID --json --non-interactive
```

Without `--ref`, the CLI uploads local source. Save the returned workflow ID before
waiting; inspect that run after a disconnect rather than scheduling a duplicate.
The workflow uses the production environment and requires API/DSN/token settings.
It publishes to `production` and uploads Sentry maps for `ledgercraft-mobile`.
**The managed job uploads maps after publication:** if it fails, inspect
`updates_json` / the published groups before retrying. A failed job can already have
published an OTA. Remediate source maps or roll back; do not blindly republish.

The local wrapper is an alternative when the publishing process has a valid
`SENTRY_AUTH_TOKEN`:

```sh
npm run update:production -- --platform ios --message "Describe the verified change"
npm run update:preview -- --platform ios --message "Describe the preview change"
```

The local wrapper exports and validates source maps, uploads them to Sentry's
configured US region, then publishes that same output with `--skip-bundler`.
Production stops before publication if credentials/maps/upload fail. EAS secret
variables available to cloud jobs are not downloadable for local publishing.
Do not print secrets or bypass the wrapper's channel/environment safeguards.
Preview and production currently both use the live API, not isolated test data.
Updates have no independently embedded signing certificate; preserve that honest
limitation rather than claiming code signing is enabled.

## Verify delivery, not just publication

1. Require workflow success, then inspect the output `first_update_group_id` and
   `updates_json`. Confirm source SHA, iOS platform, production branch/channel, and
   matching runtime. Use `eas update:view GROUP_ID --json` for release details.
2. On an installed release binary, fully close/open, allow the download to finish,
   then fully close/open again. Startup checks download in the background and apply
   on a subsequent launch; do not force reload during unsaved work. Expo Go or Metro
   does not prove this release flow.
3. Verify the changed feature and confirm the native build number is unchanged.
   User-observed before/after UI is valid evidence when automation is unavailable;
   label it as such. Do not claim unrelated product, offline, or Android QA.
4. For a paired iPhone, `xcrun devicectl device info apps --device DEVICE_ID
   --json-output FILE` can confirm the installed bundle `com.easybizinvoice.app`
   and its `version` / `bundleVersion`. Discover the current device identifier;
   don't persist a personal device ID in this skill. A locked phone blocks launches.
5. If the app container permits read access, copy only
   `Library/Application Support/.expo-internal/expo-v11.db` via
   `devicectl device copy from --domain-type appDataContainer --domain-identifier
   com.easybizinvoice.app`. This filename is SDK-specific; inspect the installed
   expo-updates source if it changes. Query `updates` for `hex(id)`, runtime,
   `successful_launch_count`, and `failed_launch_count`. Match the published UUID
   and observe the successful count increase after a controlled launch. Expo marks
   success when React content appears. Read only; never edit the device database.
6. `eas update:insights GROUP_ID --json --non-interactive` supplements device proof.
   Fresh metrics lag and download counts alone do not prove successful execution.

Record evidence in `mobile/EAS_UPDATE.md` and the relevant PR. Distinguish published,
downloaded, launched, visually verified, and broader regression coverage.

## Recovery

If a compatible OTA regresses, republish a known-good group for the same runtime or
use EAS rollback-to-embedded. Inspect current `eas update:republish --help` or the
EAS dashboard before issuing the recovery action; target the affected channel and
runtime. A Git revert or PR merge does not withdraw a published update. Preserve
Expo's recovery/anti-bricking behavior. For runtime mismatches, stop the OTA path
and prepare a native release rather than overriding compatibility.
