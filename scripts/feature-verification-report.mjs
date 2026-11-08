import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Maps actual Vitest assertions to domain coverage; never promotes API proof to UI proof.
const [input, output, ...reruns] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/feature-verification-report.mjs <vitest-json> <output-directory> [complete-file-rerun-json...]');
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'docs/feature-verification.json'), 'utf8'));
const byPath = new Map();
const attempts = new Map();
for (const reportPath of [input, ...reruns]) {
  const results = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
  if (!Array.isArray(results.testResults)) throw new Error('Input is not a Vitest JSON report');
  for (const suite of results.testResults) {
    const path = relative(root, suite.name);
    const history = attempts.get(path) ?? [];
    history.push({ report: resolve(reportPath), status: suite.status, passed: suite.assertionResults.filter(a => a.status === 'passed').length, total: suite.assertionResults.length });
    attempts.set(path, history);
    byPath.set(path, suite);
  }
}
const features = manifest.features.map(feature => {
  const suites = feature.apiTests.map(path => {
    const suite = byPath.get(path);
    const assertions = suite?.assertionResults ?? [];
    const failed = assertions.filter(a => a.status === 'failed');
    const passed = assertions.filter(a => a.status === 'passed');
    const status = !suite ? 'NOT_RUN' : suite.status === 'failed' || failed.length ? 'FAIL'
      : assertions.length > 0 && passed.length === assertions.length ? 'PASS' : 'INCOMPLETE';
    return { path, status, passed: passed.length, total: assertions.length, attempts: attempts.get(path) ?? [],
      failures: failed.map(a => ({ name: a.fullName, messages: a.failureMessages })) };
  });
  const api = suites.some(s => s.status === 'FAIL') ? 'FAIL' : suites.length && suites.every(s => s.status === 'PASS') ? 'PASS' : 'INCOMPLETE';
  return { id: feature.id, title: feature.title, api, webUI: 'NOT_RUN', expoUI: 'NOT_RUN', nativeDevice: 'NOT_RUN', liveProvider: 'NOT_RUN', suites };
});
await mkdir(resolve(output), { recursive: true });
const report = { recordedAt: new Date().toISOString(), sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  worktreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  trackedPatchSha256: createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: root })).digest('hex'),
  node: process.version, inputs: [input, ...reruns].map(path => resolve(path)), scope: 'API integration only; see separate UI evidence ledger', features };
await writeFile(resolve(output, 'api-feature-results.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(output, 'api-feature-results.md'), '# API feature verification\n\nThis report confirms only executed API assertions; UI/device/provider layers require separate evidence.\n\n| Feature | API | Passed assertions |\n| --- | --- | --- |\n' + features.map(f => `| ${f.title} | ${f.api} | ${f.suites.reduce((n,s)=>n+s.passed,0)} / ${f.suites.reduce((n,s)=>n+s.total,0)} |`).join('\n') + '\n');
console.log(JSON.stringify({ features: features.length, passed: features.filter(f => f.api === 'PASS').length, failed: features.filter(f => f.api === 'FAIL').length }));
if (features.some(f => f.api !== 'PASS')) process.exitCode = 1;
