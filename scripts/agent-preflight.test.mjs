import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assessNative,
  assessNode,
  assessNpmInstall,
  assessWorkspaceInstall,
  exitCode,
  inspectRoot,
  npmPackageKeysMatch,
  parseNodeMajor,
  readPnpmPackageManager,
} from './agent-preflight.mjs';

test('node majors match the CI jobs and a wrong major is not reusable', () => {
  assert.equal(parseNodeMajor('v22.23.4'), 22);
  assert.equal(parseNodeMajor('24.0.0'), 24);
  assert.equal(assessNode({ currentVersion: 'v22.23.4', job: 'web' }).ok, true);
  assert.equal(assessNode({ currentVersion: 'v22.23.4', job: 'api' }).ok, false);
  assert.equal(assessNode({ currentVersion: 'v20.18.0', job: 'mobile' }).ok, true);
  assert.equal(assessNode({ currentVersion: 'not-node', job: 'web' }).ok, false);
});

test('workspace reuse requires the same lockfile bytes and pnpm version', () => {
  assert.equal(assessWorkspaceInstall({ nodeModulesExists: false, rootLockExists: true }).reuse, false);
  assert.equal(assessWorkspaceInstall({
    nodeModulesExists: true,
    rootLockExists: true,
    installedLockExists: true,
    rootHash: 'abc',
    installedHash: 'def',
    modulesPackageManager: 'pnpm@11.19.0',
    requiredPackageManager: 'pnpm@11.19.0',
  }).state, 'stale');
  assert.equal(assessWorkspaceInstall({
    nodeModulesExists: true,
    rootLockExists: true,
    installedLockExists: true,
    rootHash: 'abc',
    installedHash: 'abc',
    modulesPackageManager: null,
    requiredPackageManager: 'pnpm@11.19.0',
  }).state, 'unverified');
  const match = assessWorkspaceInstall({
    nodeModulesExists: true,
    rootLockExists: true,
    installedLockExists: true,
    rootHash: 'abc',
    installedHash: 'abc',
    modulesPackageManager: 'pnpm@11.19.0',
    requiredPackageManager: 'pnpm@11.19.0',
  });
  assert.equal(match.reuse, true);
  assert.equal(readPnpmPackageManager('{"packageManager":"pnpm@11.19.0"}'), 'pnpm@11.19.0');
});

test('npm reuse compares package keys and does not pretend the lock copies are byte-identical', () => {
  const rootLock = { lockfileVersion: 3, packages: { '': {}, 'node_modules/jest': {} } };
  const installed = { lockfileVersion: 3, packages: { '': {}, 'node_modules/jest': {} } };
  assert.equal(npmPackageKeysMatch(rootLock, installed), true);
  assert.equal(assessNpmInstall({
    nodeModulesExists: true,
    lockfileVersion: 3,
    installedLockfileVersion: 3,
    packageKeySetMatches: true,
  }).reuse, true);
  assert.equal(assessNpmInstall({ nodeModulesExists: false }).state, 'absent');
  assert.match(assessNpmInstall({
    nodeModulesExists: true,
    lockfileVersion: 3,
    installedLockfileVersion: 3,
    packageKeySetMatches: false,
  }).reason, /not the check/);
});

test('absent kvm or emulator tools are blocked and a kvm device is not a ready runner', () => {
  const kvmOnly = assessNative({ kvm: true, adb: false, emulator: false, xcrun: false });
  assert.equal(kvmOnly.status, 'blocked');
  assert.equal(kvmOnly.retry, false);
  assert.match(kvmOnly.reason, /not a usable emulator/);
  const binaries = assessNative({ kvm: true, adb: true, emulator: true, xcrun: false, bootHandshake: null });
  assert.equal(binaries.status, 'not-proven');
  const held = assessNative({ kvm: true, adb: true, emulator: true, xcrun: true, bootHandshake: 'ok' }, { hold: true });
  assert.equal(held.status, 'hold');
  assert.match(held.reason, /Maestro HOLD/);
  const failed = assessNative({ kvm: true, adb: true, emulator: true, bootHandshake: 'failed' });
  assert.equal(failed.status, 'blocked');
  assert.equal(failed.retry, false);
});

test('dependency failure outranks the native exit, and hold is not ready', () => {
  assert.equal(exitCode({ dependencyOk: false, nativeStatus: 'blocked', requireNative: true }), 3);
  assert.equal(exitCode({ dependencyOk: true, nativeStatus: 'blocked', requireNative: true }), 2);
  assert.equal(exitCode({ dependencyOk: true, nativeStatus: 'hold', requireNative: true }), 2);
  assert.equal(exitCode({ dependencyOk: true, nativeStatus: 'blocked', requireNative: false }), 0);
});

test('a fixture root without node_modules is not reused and does not claim a repo-configured agent cache', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgercraft-preflight-'));
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.19.0' }));
  fs.writeFileSync(path.join(fixture, 'pnpm-lock.yaml'), 'lockfile\n');
  const report = inspectRoot(fixture, {
    nodeVersion: 'v22.23.4',
    pnpmVersion: '11.19.0',
    nativeProbes: { kvm: true, adb: false, emulator: false, xcrun: false },
    job: 'web',
    requireNative: false,
  });
  assert.equal(report.workspace.state, 'absent');
  assert.equal(report.dependencyOk, false);
  assert.equal(report.exitCode, 3);
  assert.equal(report.native.status, 'blocked');
  assert.equal(report.caching.implementedInRepo, false);
  assert.match(report.caching.manual, /not configured by repository files/);
  assert.match(report.install.workspace, /pnpm install --frozen-lockfile/);
  const cli = spawnSync(process.execPath, [path.join(import.meta.dirname, 'agent-preflight.mjs'), '--job', 'web'], {
    encoding: 'utf8',
    env: { ...process.env, LEDGERCRAFT_PREFLIGHT_ROOT: fixture, LEDGERCRAFT_PREFLIGHT_NATIVE: JSON.stringify({ kvm: false, adb: false, emulator: false, xcrun: false }) },
  });
  assert.equal(cli.status, 3, cli.stderr);
  const parsed = JSON.parse(cli.stdout);
  assert.equal(parsed.native.status, 'blocked');
  assert.equal(parsed.caching.implementedInRepo, false);
});
