# Environment preflight

```bash
node scripts/agent-preflight.mjs
node scripts/agent-preflight.mjs --job api
node scripts/agent-preflight.mjs --require-native
```

The script prints one JSON object and does not install, boot an emulator, start Maestro, deploy, or call a paid service.

## Versions

| Job | Node major | Install |
| --- | --- | --- |
| Web lint, typecheck, unit, build, release readiness | 22 | `pnpm install --frozen-lockfile` |
| API and contracts | 24 | `pnpm install --frozen-lockfile` after switching to Node 24 |
| Mobile | 20 | `cd mobile && npm ci` |

pnpm is `11.19.0` from `package.json` `packageManager`. Enable it with corepack when `pnpm -v` differs. Do not run the API job on Node 22 and then repeat it after discovering the mismatch: check `node -v` first. The preflight `node.ok` field is that check.

## When an install may be reused

Workspace reuse requires all of:

- `node_modules/.pnpm/lock.yaml` has the same SHA-256 as `pnpm-lock.yaml`
- `node_modules/.modules.yaml` records `packageManager` equal to `pnpm@11.19.0`
- the current Node major equals the job you are about to run

Anything else is `absent`, `stale`, or `unverified`, and `dependencyOk` is false (exit 3). The printed `install` commands are the next step. The script does not run them.

Mobile reuse requires `mobile/node_modules`, the same `lockfileVersion`, and the same `packages` key set in `mobile/package-lock.json` and `mobile/node_modules/.package-lock.json`. Those two files are not expected to be byte-identical. A mismatch means `npm ci`, not a partial copy.

The pnpm metadata this script reads does not record the Node ABI. Reinstall when you move between Node 20, 22, and 24 even if the lockfile hash matches. Native addons built for another major are not reusable.

## Caching that is already in CI, and caching that is not

GitHub Actions already sets `actions/setup-node` `cache: pnpm` on the workspace jobs and `cache: npm` with `mobile/package-lock.json` on the mobile job. This change does not add or edit that workflow.

A Cursor cloud environment snapshot, a warm pnpm store shared across agent VMs, and any other agent-level dependency cache are **not** configured by files in this repository. Do not describe them as implemented. They remain manual settings outside the repo. Preflight only decides whether the `node_modules` tree already on disk matches this lockfile and Node major.

## Native runners

`native.status` is the runner decision:

| Status | Meaning |
| --- | --- |
| `blocked` | `/dev/kvm`, `adb`, or `emulator` is missing, or a supplied handshake failed. Stop. `retry` is false. |
| `not-proven` | Those binaries exist and no boot-plus-driver handshake was supplied. KVM alone is not a usable runner. |
| `hold` | A handshake was supplied and Maestro HOLD is still on. Do not start a flow. |
| `ready` | Not returned while Maestro HOLD is on. |

The CLI never starts an emulator, so it will not return `ready`. `--require-native` exits 2 unless status is `ready`. Exit 0 from a normal preflight does not mean a device is usable. Read `native.status`.

Maestro HOLD for this repository: no EAS build, no emulator or simulator run, no deployment, and no production test from agent tooling. iOS `xcrun` is reported as present or absent. On Linux it is expected to be absent; that alone does not make an Android `blocked` result into a pass.

Installed-device evidence stays `device-qa-pending` until a named device run exists. Expo web and a bundle export are not that run.
