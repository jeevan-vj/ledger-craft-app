import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
function job(file, name) {
  const text = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
  const start = text.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `Missing ${name} job in ${file}`);
  return text.slice(start + 1).split(/\n(?=  [\w-]+:\n)/)[0];
}
function command(jobText, prefix) {
  const step = jobText.split(/(?=^      - )/m).find((value) => new RegExp(`^      - name: ${prefix}(?:\\s|$)`, 'm').test(value));
  assert.ok(step, `Missing ${prefix} step`);
  const lines = step.split('\n');
  const at = lines.findIndex((line) => /^        run:/.test(line));
  assert.notEqual(at, -1, `${prefix} must run a command`);
  const value = lines[at].replace(/^        run:\s*/, '');
  return value === '|' ? lines.slice(at + 1).filter((line) => /^          /.test(line)).map((line) => line.slice(10)).join('\n') : value;
}
function probe(script, failure) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgercraft-quality-gate-'));
  try {
    const calls = path.join(directory, 'calls.txt');
    fs.writeFileSync(path.join(directory, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$QUALITY_CALLS"
case "$*" in
  lint) [ "$QUALITY_FAILURE" != lint ] || exit 17 ;;
  *tsconfig.app.json*) [ "$QUALITY_FAILURE" != app ] || exit 18 ;;
  *tsconfig.node.json*) [ "$QUALITY_FAILURE" != node ] || exit 19 ;;
esac
exit 0
`, { mode: 0o755 });
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}`, QUALITY_CALLS: calls, QUALITY_FAILURE: failure },
      encoding: 'utf8',
    });
    assert.ifError(result.error);
    return { status: result.status, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '' };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
for (const [file, lintJob, typeJob] of [['ci.yml', 'web-lint', 'web-typecheck'], ['release.yml', 'verify', 'verify']]) {
  test(`${file} fails on a lint error rather than allowing an error budget`, () => {
    const block = job(file, lintJob);
    assert.doesNotMatch(block, /continue-on-error:\s*true|ci-baseline-gate|set \+e/);
    const script = command(block, 'Lint');
    assert.equal(probe(script, '').status, 0);
    assert.notEqual(probe(script, 'lint').status, 0);
  });
  test(`${file} fails independently on app and Node-config TypeScript errors`, () => {
    const block = job(file, typeJob);
    assert.doesNotMatch(block, /continue-on-error:\s*true|ci-baseline-gate|set \+e/);
    const script = command(block, 'Typecheck');
    const success = probe(script, '');
    assert.equal(success.status, 0);
    assert.match(success.calls, /tsc --noEmit -p tsconfig\.app\.json --pretty false/);
    assert.match(success.calls, /tsc --noEmit -p tsconfig\.node\.json --pretty false/);
    assert.notEqual(probe(script, 'app').status, 0);
    assert.notEqual(probe(script, 'node').status, 0);
  });
}
