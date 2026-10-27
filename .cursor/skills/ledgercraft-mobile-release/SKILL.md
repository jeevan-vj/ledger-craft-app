---
name: ledgercraft-mobile-release
description: Builds, submits, and verifies LedgerCraft's Expo iOS releases with EAS and TestFlight. Use for iOS archives, EAS Build, App Store Connect, TestFlight installation, submission status, or mobile release handoff work in this repository.
---

# LedgerCraft mobile release

Use this skill after `ledgercraft-bootstrap`. For generic EAS mechanics, also
follow the installed `eas-app-stores` skill; this file contains the LedgerCraft-
specific facts and decisions that should not be rediscovered.

## Stable release identity

| Item | Value |
| --- | --- |
| Expo owner/project | `@jnok/easybizinvoice` (owner `jnok`) |
| EAS project ID | `6bb662da-bb2f-405d-876f-cea471908f74` |
| Previous EAS project (retired) | `@jeevan90/easybizinvoice-mobile`, `7148323b-502c-447e-96c3-a5c1704c40c9` |
| App name/version | `easybizinvoice` / `1.0.0` |
| iOS bundle identifier | `com.easybizinvoice.app` |
| Apple team | `88282K637B` |
| App Store Connect app ID | `6818787287` (iOS credentials on the jnok project not yet checked) |
| App Store Connect provider | `128291446` |
| TestFlight group | `Team (Expo)` |
| Mobile directory | `mobile/` |

Useful pages:

- EAS project: https://expo.dev/accounts/jnok/projects/easybizinvoice
- App Store Connect TestFlight: https://appstoreconnect.apple.com/apps/6818787287/testflight/ios

These identifiers are configuration, not authorization to build, submit, invite
testers, or release. EAS builds consume plan capacity and store submissions
change external state. Perform each mutation only when the user requests it.
An EAS build is not the Mobile CI job. Before a pull request, run the Node 20
lint, typecheck, Jest, and iOS export commands in `ledgercraft-verify`.

## Current known release

As of 2026-10-04:

- EAS iOS production build `170b1d99-61c0-4616-8ccd-e3a111c10f21` completed as
  version `1.0.0`, build `2`.
- EAS submission `1b89f039-ccbc-4af5-8e7f-81874f082f54` uploaded that archive
  successfully to App Store Connect. Apple processing was the last observed
  state; re-check live state before claiming it is installable.
- The App Store Connect app and bundle ID already exist. Do not create duplicates.
- An App Store Connect API key with the `APP_MANAGER` role is stored by EAS for
  submission. Never copy the private key into the repository.
- The Apple account used during setup has internal access to `Team (Expo)`.
  Other testers still need to be added through App Store Connect.

Historical IDs are evidence and recovery handles, not defaults for a new build.
Use the newest suitable build unless the user explicitly selects an older one.

## Configuration invariants

- `mobile/app.config.js` owns the dynamic Expo config and contains the EAS
  project ID, bundle identifier, `easybizinvoice` scheme, and non-exempt-
  encryption declaration.
- `mobile/eas.json` uses the `production` profile with `autoIncrement: true` and
  local app-version sourcing. Inspect both `app.config.js` and `app.json` before
  changing a version or build number because EAS may update `app.json`.
- EAS production environment variables must include:
  - `EXPO_PUBLIC_API_URL=https://ledgercraft-api.jeevan90wijerathna.workers.dev`
  - `EXPO_PUBLIC_APP_ORIGIN=easybizinvoice://`
- Public Expo variables are bundled into the app. Do not place secrets in
  `EXPO_PUBLIC_*` variables.
- The repository-pinned EAS CLI `14.7.x` has crashed under Node 26. Use
  `npx --yes eas-cli@latest ...` for release commands until the dependency is
  upgraded and verified.

## Preflight

Work from `mobile/`. Preserve unrelated dirty-tree changes and inspect what EAS
will archive. A remote build packages the working tree, not merely the last Git
commit, so never describe the recorded Git SHA as proof that all inputs were
committed.

Before requesting a paid build:

1. Confirm `npx --yes eas-cli@latest whoami` resolves to a member or robot of the
   `jnok` account, and `npx --yes eas-cli@25.3.0 project:info` resolves
   `@jnok/easybizinvoice`.
2. Inspect `app.config.js`, `app.json`, and `eas.json`; confirm the stable IDs
   above and the intended version.
3. Inspect the production EAS environment. Restore missing public values before
   building; never print or persist secret values.
4. Run risk-proportionate mobile verification. At minimum, run the focused tests
   for the changed feature and an iOS production Expo export. Follow
   `ledgercraft-verify` and `ledgercraft-mobile-ui` for broader changes.
5. Report unrelated known test or type-check failures separately. Do not claim a
   full green suite when only focused verification passed.

## Build an iOS archive

Only after explicit build authorization:

```bash
cd mobile
npx --yes eas-cli@latest build --platform ios --profile production
```

Let EAS reuse valid credentials unless rotation was explicitly requested. If
Apple authentication is required, the human must provide any 2FA response in a
private prompt; never record it in output, files, or docs. Capture the resulting
build ID, version, build number, status, build page, and artifact URL.

A production App Store archive cannot normally be installed by opening its IPA
URL. For an iPhone installation, submit it to TestFlight or intentionally create
an internal-distribution build under a separate request.

## Submit an existing build to TestFlight

Submission is separately authorized from building. Prefer submitting the
already-verified build rather than creating another archive:

```bash
cd mobile
npx --yes eas-cli@latest submit --platform ios --id <build-id> --profile production
```

Use the existing App Store Connect app ID `6818787287`. If EAS asks to generate
an App Store Connect API key and no valid submission key exists, choose the
least-privilege `APP_MANAGER` role. Do not generate repeated keys merely to retry
a transient queue failure.

Successful upload is not the same as completed Apple processing. Record the EAS
submission ID and link, then verify the live submission result. App Store
Connect may take several minutes to process the binary. Until it appears under
TestFlight without processing errors, describe it as uploaded/processing rather
than installable.

## Installation and tester access

After Apple processing succeeds, an internal tester installs through Apple's
TestFlight app using an Apple account that belongs to the internal group. The
EAS artifact link alone is not an iOS installation link for this store archive.

Do not add users, enable a public link, or submit an external group for Beta App
Review without a user request. External testing is a separate App Store Connect
action and may require beta review and compliance information.

## Recovery and close-out

- If a command disconnects after scheduling, inspect the existing build or
  submission by ID before retrying. Avoid duplicate builds and uploads.
- If Apple rejects a duplicate build number, increment through the configured
  production flow and rebuild; an uploaded binary cannot be changed in place.
- If App Store Connect cannot find the app, confirm bundle ID, team, and app ID
  before creating anything.
- Do not commit, push, publish to the App Store, or invite testers unless asked.
- At close-out, update `AGENTS.md`, `TARGET_ARCHITECTURE.md`, and
  `ledgercraft-bootstrap` with facts only: IDs, observed status, verification,
  and the next pending gate. Never store credentials or authentication codes.
