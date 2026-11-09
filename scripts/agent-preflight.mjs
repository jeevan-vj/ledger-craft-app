#!/usr/bin/env node
/**
 * Check Node, pnpm, and lockfile identity before reusing an install.
 * Native emulator status is explicit. This script never boots an emulator,
 * starts Maestro, installs packages, or deploys.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NODE_MAJORS = Object.freeze({ web: 22, release: 22, api: 24, mobile: 20 });
export const REQUIRED_PNPM = 'pnpm@11.19.0';

export function parseNodeMajor(version) {
  const match = /^v?(\d+)\./.exec(String(version ?? '').trim());
  return match ? Number(match[1]) : null;
}

export function parsePackageManager(packageJsonText) {
  const parsed = JSON.parse(packageJsonText);
  return typeof parsed.packageManager === 'string' ? parsed.packageManager : null;
}

export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function readPnpmPackageManager(modulesYamlText) {
  const text = String(modulesYamlText ?? '');
  if (text.trim().startsWith('{')) {
    const parsed = JSON.parse(text);
    return typeof parsed.packageManager === 'string' ? parsed.packageManager : null;
  }
  const match = text.match(/packageManager:\s*["']?([^\s"']+)/);
  return match ? match[1] : null;
}

export function assessWorkspaceInstall({
  nodeModulesExists,
  rootLockExists,
  installedLockExists,
  rootHash,
  installedHash,
  modulesPackageManager,
  requiredPackageManager,
}) {
  if (!nodeModulesExists || !rootLockExists) {
    return { state: 'absent', reuse: false, reason: 'Workspace dependencies are not installed for this lockfile.' };
  }
  if (!installedLockExists || !rootHash || rootHash !== installedHash) {
    return { state: 'stale', reuse: false, reason: 'node_modules/.pnpm/lock.yaml does not match pnpm-lock.yaml.' };
  }
  if (!modulesPackageManager) {
    return { state: 'unverified', reuse: false, reason: 'node_modules/.modules.yaml has no packageManager, so the install cannot be attributed to the required pnpm version.' };
  }
  if (requiredPackageManager && modulesPackageManager !== requiredPackageManager) {
    return { state: 'package-manager-mismatch', reuse: false, reason: `Installed package manager is ${modulesPackageManager}; the repo requires ${requiredPackageManager}.` };
  }
  return { state: 'match', reuse: true, reason: 'The installed pnpm lockfile copy matches pnpm-lock.yaml.' };
}

export function assessNpmInstall({ nodeModulesExists, lockfileVersion, installedLockfileVersion, packageKeySetMatches }) {
  if (!nodeModulesExists) {
    return { state: 'absent', reuse: false, reason: 'mobile/node_modules is absent. npm ci is required.' };
  }
  if (lockfileVersion == null || installedLockfileVersion == null || lockfileVersion !== installedLockfileVersion || packageKeySetMatches !== true) {
    return { state: 'stale-or-unverified', reuse: false, reason: 'mobile/node_modules does not match mobile/package-lock.json package keys. Run npm ci. Byte equality with node_modules/.package-lock.json is not the check.' };
  }
  return { state: 'package-key-match', reuse: true, reason: 'mobile lockfileVersion and package keys match the installed copy. This is not a byte-identical cache guarantee.' };
}

export function npmPackageKeysMatch(rootLock, installedLock) {
  const rootKeys = Object.keys(rootLock?.packages ?? {}).sort();
  const installedKeys = Object.keys(installedLock?.packages ?? {}).sort();
  if (rootKeys.length === 0 || installedKeys.length === 0) return false;
  return rootKeys.join('\n') === installedKeys.join('\n');
}

export function assessNode({ currentVersion, job }) {
  const major = parseNodeMajor(currentVersion);
  const expected = job ? NODE_MAJORS[job] ?? null : null;
  if (job && expected == null) return { major, expected: null, ok: false, reason: `Unknown job ${job}.` };
  if (expected == null) {
    return { major, expected: null, ok: major != null, reason: 'No job selected. Compare process.version with the job table before running a CI job.' };
  }
  return {
    major,
    expected,
    ok: major === expected,
    reason: major === expected
      ? `Node ${major} matches the ${job} job.`
      : `Node ${major ?? 'unknown'} does not match the ${job} job, which requires Node ${expected}. Do not reuse this shell for that job.`,
  };
}

/**
 * KVM presence is not a usable emulator. Absent tools are blocked.
 * A boot handshake is data the caller already observed; this function does not start a device.
 * Maestro HOLD refuses a ready status even after a successful handshake.
 */
export function assessNative(probes, { hold = true } = {}) {
  const missing = [];
  if (!probes.kvm) missing.push('/dev/kvm');
  if (!probes.adb) missing.push('adb');
  if (!probes.emulator) missing.push('emulator');
  const ios = probes.xcrun ? 'present' : 'absent';
  if (missing.length > 0) {
    return {
      status: 'blocked',
      missing,
      iosSimulator: ios,
      functionalBoot: 'not-run',
      maestro: 'hold',
      retry: false,
      reason: `Native runner is blocked. Missing ${missing.join(', ')}. /dev/kvm by itself is not a usable emulator. Do not retry speculative boots. iOS simulator tooling is ${ios}.`,
    };
  }
  if (probes.bootHandshake == null) {
    return {
      status: 'not-proven',
      missing: [],
      iosSimulator: ios,
      functionalBoot: 'not-run',
      maestro: hold ? 'hold' : 'not-run',
      retry: false,
      reason: 'Emulator binaries are present. No functional boot and Maestro-driver handshake was supplied. Do not treat this as a usable runner.',
    };
  }
  if (probes.bootHandshake !== 'ok') {
    return {
      status: 'blocked',
      missing: [],
      iosSimulator: ios,
      functionalBoot: 'failed',
      maestro: 'hold',
      retry: false,
      reason: 'The functional emulator handshake failed. Stop. Do not loop on boot attempts from this environment.',
    };
  }
  if (hold) {
    return {
      status: 'hold',
      missing: [],
      iosSimulator: ios,
      functionalBoot: 'ok',
      maestro: 'hold',
      retry: false,
      reason: 'Maestro HOLD: do not run EAS, an emulator flow, a deployment, or a production test from this tooling.',
    };
  }
  return {
    status: 'ready',
    missing: [],
    iosSimulator: ios,
    functionalBoot: 'ok',
    maestro: 'allowed',
    retry: false,
    reason: 'A functional handshake was supplied and Maestro HOLD is off.',
  };
}

export function exitCode({ dependencyOk, nativeStatus, requireNative }) {
  if (!dependencyOk) return 3;
  if (requireNative && nativeStatus !== 'ready') return 2;
  return 0;
}

export function cachingReport() {
  return {
    implementedInRepo: false,
    githubActions: 'CI already sets actions/setup-node cache: pnpm for workspace jobs and cache: npm with mobile/package-lock.json in .github/workflows/ci.yml. This tooling does not add or change that cache.',
    manual: 'Cursor cloud environment snapshots and a persistent pnpm store across agent VMs are not configured by repository files. Do not describe them as implemented. Reuse a local node_modules tree only when this preflight says the lockfile matches and the Node major matches the job. Native addons still need a reinstall when switching among Node 20, 22, and 24 because this metadata does not record the Node ABI.',
  };
}

function commandExists(name) {
  const result = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function inspectRoot(root, { nodeVersion, pnpmVersion, nativeProbes, job, requireNative, hold = true }) {
  const packageJsonPath = path.join(root, 'package.json');
  const requiredPackageManager = fs.existsSync(packageJsonPath)
    ? parsePackageManager(fs.readFileSync(packageJsonPath, 'utf8'))
    : null;
  const nodeModules = path.join(root, 'node_modules');
  const rootLock = path.join(root, 'pnpm-lock.yaml');
  const installedLock = path.join(nodeModules, '.pnpm/lock.yaml');
  const modulesYaml = path.join(nodeModules, '.modules.yaml');
  const nodeModulesExists = fs.existsSync(nodeModules);
  const rootLockExists = fs.existsSync(rootLock);
  const installedLockExists = fs.existsSync(installedLock);
  const workspace = assessWorkspaceInstall({
    nodeModulesExists,
    rootLockExists,
    installedLockExists,
    rootHash: rootLockExists && installedLockExists ? sha256File(rootLock) : null,
    installedHash: rootLockExists && installedLockExists ? sha256File(installedLock) : null,
    modulesPackageManager: fs.existsSync(modulesYaml) ? readPnpmPackageManager(fs.readFileSync(modulesYaml, 'utf8')) : null,
    requiredPackageManager,
  });
  const mobileLockPath = path.join(root, 'mobile/package-lock.json');
  const mobileInstalledPath = path.join(root, 'mobile/node_modules/.package-lock.json');
  const mobileRoot = readJsonIfExists(mobileLockPath);
  const mobileInstalled = readJsonIfExists(mobileInstalledPath);
  const mobile = assessNpmInstall({
    nodeModulesExists: fs.existsSync(path.join(root, 'mobile/node_modules')),
    lockfileVersion: mobileRoot?.lockfileVersion ?? null,
    installedLockfileVersion: mobileInstalled?.lockfileVersion ?? null,
    packageKeySetMatches: mobileRoot && mobileInstalled ? npmPackageKeysMatch(mobileRoot, mobileInstalled) : false,
  });
  const pnpmOk = pnpmVersion === requiredPackageManager?.replace(/^pnpm@/, '');
  const node = assessNode({ currentVersion: nodeVersion, job });
  const dependencyOk = workspace.reuse && pnpmOk && node.ok && (!job || job !== 'mobile' || mobile.reuse);
  const native = assessNative(nativeProbes, { hold });
  const install = {
    workspace: 'corepack enable && corepack prepare pnpm@11.19.0 --activate && pnpm install --frozen-lockfile',
    mobile: 'cd mobile && npm ci',
    note: 'Run the install that matches the job Node major. Do not reuse node_modules across Node 20, 22, and 24.',
  };
  return {
    job: job ?? null,
    node,
    pnpm: {
      actual: pnpmVersion,
      required: requiredPackageManager,
      ok: pnpmOk,
    },
    workspace,
    mobile,
    dependencyOk,
    install,
    native,
    caching: cachingReport(),
    exitCode: exitCode({ dependencyOk, nativeStatus: native.status, requireNative }),
    requireNative: Boolean(requireNative),
  };
}

function parseCli(argv) {
  let job = null;
  let requireNative = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--job') job = argv[++i];
    else if (arg.startsWith('--job=')) job = arg.slice('--job='.length);
    else if (arg === '--require-native') requireNative = true;
  }
  return { job, requireNative };
}

function liveNativeProbes() {
  if (process.env.LEDGERCRAFT_PREFLIGHT_NATIVE) return JSON.parse(process.env.LEDGERCRAFT_PREFLIGHT_NATIVE);
  return {
    kvm: fs.existsSync('/dev/kvm'),
    adb: commandExists('adb'),
    emulator: commandExists('emulator'),
    xcrun: commandExists('xcrun'),
    bootHandshake: null,
  };
}

function main() {
  const { job, requireNative } = parseCli(process.argv.slice(2));
  const root = process.env.LEDGERCRAFT_PREFLIGHT_ROOT
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pnpm = spawnSync('pnpm', ['-v'], { encoding: 'utf8' });
  const report = inspectRoot(root, {
    nodeVersion: process.version,
    pnpmVersion: pnpm.status === 0 ? pnpm.stdout.trim() : null,
    nativeProbes: liveNativeProbes(),
    job,
    requireNative,
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.exitCode);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
