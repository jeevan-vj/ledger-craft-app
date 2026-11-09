#!/usr/bin/env node
/**
 * Run one package's tests so a filename actually limits execution.
 *
 * `pnpm <script> -- src/file.test.ts` appends `--` before the filename.
 * Vitest treats that `--` as the end of positionals and then runs the whole
 * include set. This wrapper removes one leading `--`, invokes the runner
 * with the filename still in argv, and fails if the runner reports a
 * different file count.
 *
 * With no filename, the command is the full package suite used by CI.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PACKAGES = new Set(['web', 'api', 'contracts', 'mobile']);

export function repoRootFrom(metaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
}

export function parseTargetedArgs(argv) {
  let packageName = null;
  let dryRun = false;
  let verbose = false;
  let logPath = null;
  const forwarded = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--package') {
      packageName = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--package=')) {
      packageName = arg.slice('--package='.length);
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--verbose') {
      verbose = true;
      continue;
    }
    if (arg === '--log') {
      logPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--log=')) {
      logPath = arg.slice('--log='.length);
      continue;
    }
    forwarded.push(arg);
  }
  if (forwarded[0] === '--') forwarded.shift();
  if (!PACKAGES.has(packageName)) {
    throw new Error('Missing or unknown --package. Use web, api, contracts, or mobile.');
  }
  return { packageName, forwarded, dryRun, verbose, logPath };
}

export function testFileArgs(args) {
  return args.filter((arg) => !arg.startsWith('-') && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(arg));
}

export function reporterHidesSummary(args) {
  const text = args.join(' ');
  return /(?:^|\s)--reporter(?:=|\s+)json\b/.test(text) || /(?:^|\s)--json\b/.test(text);
}

export function planTargetedTest({ packageName, forwarded, repoRoot }) {
  const files = testFileArgs(forwarded);
  if (packageName === 'mobile') {
    const hasWatch = forwarded.some((arg) => arg === '--watchAll' || arg.startsWith('--watchAll=') || arg === '--watch' || arg.startsWith('--watch='));
    const args = [...forwarded];
    if (files.length > 0 && !hasWatch) args.push('--watchAll=false');
    return {
      packageName,
      cwd: path.join(repoRoot, 'mobile'),
      runner: 'jest',
      binCandidates: [path.join(repoRoot, 'mobile/node_modules/jest/bin/jest.js')],
      args,
      files,
    };
  }
  const cwd = packageName === 'web'
    ? repoRoot
    : packageName === 'api'
      ? path.join(repoRoot, 'api')
      : path.join(repoRoot, 'packages/contracts');
  return {
    packageName,
    cwd,
    runner: 'vitest',
    binCandidates: [
      path.join(cwd, 'node_modules/vitest/vitest.mjs'),
      path.join(repoRoot, 'node_modules/vitest/vitest.mjs'),
    ],
    args: ['run', ...forwarded],
    files,
  };
}

export function reportedCount(output, runner) {
  if (runner === 'vitest') {
    const match = output.match(/Test Files\s+.*\((\d+)\)/);
    return match ? Number(match[1]) : null;
  }
  const match = output.match(/Test Suites:\s+.*?(\d+)\s+total/);
  return match ? Number(match[1]) : null;
}

export function scopeCheck({ output, runner, fileCount, hideSummary }) {
  if (fileCount === 0) return { ok: true, reported: null, skipped: false };
  if (hideSummary) return { ok: true, reported: null, skipped: true };
  const reported = reportedCount(output, runner);
  if (reported == null) {
    return {
      ok: false,
      reported: null,
      skipped: false,
      reason: 'Runner output did not include a file count, so the filename cannot be shown to have scoped execution.',
    };
  }
  if (reported !== fileCount) {
    return {
      ok: false,
      reported,
      skipped: false,
      reason: `Runner reported ${reported} file(s) for ${fileCount} requested file(s).`,
    };
  }
  return { ok: true, reported, skipped: false };
}

export function summaryLines(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => /Test Files|Test Suites|^\s*Tests\s|Duration|FAIL\s|Failed Tests|AssertionError|No test files/.test(line))
    .slice(0, 40);
}

function resolveBin(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function printResult({ plan, bin, logFile, output, status, scope }) {
  const command = ['node', bin, ...plan.args].join(' ');
  console.log(`targeted-test package=${plan.packageName} files=${plan.files.length}`);
  console.log(`command: ${command}`);
  console.log(`cwd: ${plan.cwd}`);
  if (logFile) console.log(`log: ${logFile}`);
  for (const line of summaryLines(output)) console.log(line);
  if (scope?.reason) console.log(scope.reason);
  console.log(`exit: ${status}`);
}

function main() {
  const options = parseTargetedArgs(process.argv.slice(2));
  const plan = planTargetedTest({ ...options, repoRoot: repoRootFrom() });
  const bin = resolveBin(plan.binCandidates);
  if (options.dryRun) {
    console.log(JSON.stringify({
      packageName: plan.packageName,
      cwd: plan.cwd,
      runner: plan.runner,
      args: plan.args,
      files: plan.files,
      bin: bin ?? plan.binCandidates[0],
    }, null, 2));
    return;
  }
  if (!bin) {
    console.error(`targeted-test: ${plan.runner} is not installed for ${plan.packageName}. Run the install command in docs/agent/ENVIRONMENT.md. Do not guess a different package manager.`);
    process.exit(127);
  }
  const capture = plan.files.length > 0;
  const result = spawnSync(process.execPath, [bin, ...plan.args], {
    cwd: plan.cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (!capture) process.exit(result.status ?? 1);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const logFile = options.logPath ?? path.join(os.tmpdir(), `ledgercraft-targeted-test-${process.pid}.log`);
  fs.writeFileSync(logFile, output);
  const scope = scopeCheck({
    output,
    runner: plan.runner,
    fileCount: plan.files.length,
    hideSummary: reporterHidesSummary(plan.args),
  });
  if (options.verbose || process.env.CI) process.stdout.write(output);
  const status = scope.ok ? (result.status ?? 1) : 1;
  printResult({ plan, bin, logFile, output, status, scope });
  process.exit(status);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
