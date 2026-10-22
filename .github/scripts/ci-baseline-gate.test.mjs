import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  lintRises,
  parseEslintCounts,
  parseJestFailed,
  parseTscCount,
  readLintCeiling,
  resolveEslintCounts,
} from './ci-baseline-gate.mjs';

const scriptPath = fileURLToPath(new URL('./ci-baseline-gate.mjs', import.meta.url));
const committedBaseline = fileURLToPath(new URL('../lint-baseline.json', import.meta.url));

function runGate(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
}

function writeTemp(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-gate-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

test('parses the last eslint summary, including a zero count', () => {
  const text = [
    'note (1 error, 2 warnings) in a sentence',
    '✖ 88 problems (0 errors, 88 warnings)',
    '  0 errors and 10 warnings potentially fixable with the `--fix` option.',
  ].join('\n');
  assert.deepEqual(parseEslintCounts(text), { errors: 0, warnings: 88 });
});

test('a clean eslint log is zero only when the process exited 0', () => {
  assert.deepEqual(resolveEslintCounts('', 0), { errors: 0, warnings: 0 });
  assert.equal(resolveEslintCounts('ESLint crashed', 2), null);
  assert.deepEqual(resolveEslintCounts('✖ 2 problems (1 error, 1 warning)', 1), {
    errors: 1,
    warnings: 1,
  });
});

test('eslint ceilings fail independently and allow a lower count', () => {
  const ceiling = { errors: 467, warnings: 113 };
  assert.deepEqual(lintRises({ errors: 467, warnings: 113 }, ceiling), []);
  assert.deepEqual(lintRises({ errors: 400, warnings: 10 }, ceiling), []);
  assert.deepEqual(lintRises({ errors: 468, warnings: 113 }, ceiling), [
    'errors 468 exceed baseline 467',
  ]);
  assert.deepEqual(lintRises({ errors: 467, warnings: 114 }, ceiling), [
    'warnings 114 exceed baseline 113',
  ]);
  assert.deepEqual(lintRises({ errors: 466, warnings: 114 }, ceiling), [
    'warnings 114 exceed baseline 113',
  ]);
});

test('committed lint baseline has integer web and mobile ceilings and no api entry', () => {
  const baseline = JSON.parse(fs.readFileSync(committedBaseline, 'utf8'));
  assert.equal(baseline.api, undefined);
  for (const target of ['web', 'mobile']) {
    const ceiling = readLintCeiling(committedBaseline, target);
    assert.ok(ceiling.errors >= 0);
    assert.ok(ceiling.warnings >= 0);
  }
  assert.throws(() => readLintCeiling(committedBaseline, 'api'), /api/);
});

test('eslint CLI passes at the ceiling, fails when warnings rise, and accepts a lower count', () => {
  const baseline = writeTemp(
    'lint-baseline.json',
    JSON.stringify({ mobile: { errors: 0, warnings: 2 } }),
  );
  const atCeiling = writeTemp('lint.txt', '✖ 2 problems (0 errors, 2 warnings)\n');
  const pass = runGate(['eslint', atCeiling, baseline, 'mobile', '0']);
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /eslint mobile: 0 errors, 2 warnings \(baseline 0 errors, 2 warnings\)/);

  const lower = writeTemp('lint.txt', '');
  const under = runGate(['eslint', lower, baseline, 'mobile', '0']);
  assert.equal(under.status, 0, under.stderr);
  assert.match(under.stdout, /under the baseline/);

  const risen = writeTemp('lint.txt', '✖ 3 problems (0 errors, 3 warnings)\n');
  const fail = runGate(['eslint', risen, baseline, 'mobile', '0']);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /warnings 3 exceed baseline 2/);
});

test('eslint CLI fails when the log has no summary and the exit code is non-zero', () => {
  const baseline = writeTemp(
    'lint-baseline.json',
    JSON.stringify({ web: { errors: 1, warnings: 1 } }),
  );
  const log = writeTemp('lint.txt', 'pnpm: command not found\n');
  const result = runGate(['eslint', log, baseline, 'web', '127']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not parse eslint results/);
});

test('tsc ceiling still counts error TS lines and ignores a lower total', () => {
  assert.equal(parseTscCount('src/a.ts(1,1): error TS2554: nope\nerror TS2349: also\n'), 2);
  const log = writeTemp('tsc.txt', 'src/a.ts(1,1): error TS2554: nope\n');
  assert.equal(runGate(['tsc', log, '1']).status, 0);
  assert.equal(runGate(['tsc', log, '0']).status, 1);
});

test('jest ceiling reads the Tests summary', () => {
  const text = 'Tests:       2 failed, 8 passed, 10 total';
  assert.equal(parseJestFailed(text)?.count, 2);
  const log = writeTemp('jest.txt', `${text}\n`);
  assert.equal(runGate(['jest', log, '2']).status, 0);
  assert.equal(runGate(['jest', log, '1']).status, 1);
});
