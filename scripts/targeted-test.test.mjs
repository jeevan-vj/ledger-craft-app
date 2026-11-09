import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  parseTargetedArgs,
  planTargetedTest,
  repoRootFrom,
  reportedCount,
  scopeCheck,
} from './targeted-test.mjs';

const root = repoRootFrom(import.meta.url);

test('a leading pnpm -- is removed so the filename stays a vitest positional', () => {
  const options = parseTargetedArgs(['--package', 'api', '--', 'src/modules/sales/sales.test.ts']);
  const plan = planTargetedTest({ ...options, repoRoot: root });
  assert.deepEqual(plan.files, ['src/modules/sales/sales.test.ts']);
  assert.equal(plan.args[0], 'run');
  assert.equal(plan.args.includes('--'), false);
  assert.equal(plan.args.at(-1), 'src/modules/sales/sales.test.ts');
  assert.equal(plan.cwd, path.join(root, 'api'));
  assert.equal(plan.runner, 'vitest');
});

test('package scripts delegate to the wrapper and CI commands keep their names', () => {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const apiPackage = JSON.parse(fs.readFileSync(path.join(root, 'api/package.json'), 'utf8'));
  const contractsPackage = JSON.parse(fs.readFileSync(path.join(root, 'packages/contracts/package.json'), 'utf8'));
  const mobilePackage = JSON.parse(fs.readFileSync(path.join(root, 'mobile/package.json'), 'utf8'));
  for (const script of [rootPackage.scripts['test:api'], rootPackage.scripts['test:contracts'], rootPackage.scripts['test:run'], apiPackage.scripts.test, contractsPackage.scripts.test, mobilePackage.scripts.test]) {
    assert.match(script, /targeted-test\.mjs/);
  }
  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /pnpm test:api && pnpm test:contracts && pnpm type-check:api/);
  assert.match(ci, /pnpm test:run/);
  assert.match(ci, /npm test -- --ci --watchAll=false/);
});

test('mobile CI flags are forwarded and a filename forces a non-watching jest run', () => {
  const ci = parseTargetedArgs(['--package', 'mobile', '--ci', '--watchAll=false']);
  const full = planTargetedTest({ ...ci, repoRoot: root });
  assert.deepEqual(full.files, []);
  assert.ok(full.args.includes('--ci'));
  assert.ok(full.args.includes('--watchAll=false'));
  assert.equal(full.args.filter((arg) => arg === '--watchAll=false').length, 1);
  const targeted = planTargetedTest({
    ...parseTargetedArgs(['--package', 'mobile', '--', 'src/screens/sales/SellScreen.test.tsx']),
    repoRoot: root,
  });
  assert.equal(targeted.args.at(-1), '--watchAll=false');
  assert.equal(targeted.args.includes('--'), false);
  assert.equal(targeted.runner, 'jest');
});

test('scope check fails closed when vitest reports the whole include set', () => {
  const broad = scopeCheck({
    output: 'Test Files  26 passed (26)\nTests  106 passed (106)\n',
    runner: 'vitest',
    fileCount: 1,
    hideSummary: false,
  });
  assert.equal(broad.ok, false);
  assert.equal(broad.reported, 26);
  const scoped = scopeCheck({
    output: 'Test Files  1 passed (1)\nTests  4 passed (4)\n',
    runner: 'vitest',
    fileCount: 1,
    hideSummary: false,
  });
  assert.equal(scoped.ok, true);
  assert.equal(reportedCount('Test Suites: 1 failed, 1 total', 'jest'), 1);
  const hidden = scopeCheck({ output: '{"numTotalTestSuites":26}', runner: 'vitest', fileCount: 1, hideSummary: true });
  assert.equal(hidden.ok, true);
  assert.equal(hidden.skipped, true);
});

test('a full suite plan does not invent a file filter', () => {
  const plan = planTargetedTest({ ...parseTargetedArgs(['--package', 'contracts']), repoRoot: root });
  assert.deepEqual(plan.args, ['run']);
  assert.deepEqual(plan.files, []);
  assert.equal(plan.cwd, path.join(root, 'packages/contracts'));
});
