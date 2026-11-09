import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('the module map only names files that exist', () => {
  const text = read('docs/agent/CODEMAP.md');
  const paths = [...text.matchAll(/`((?:api|src|mobile|packages|\.cursor|docs)\/[^`]+)`/g)].map((match) => match[1]);
  assert.ok(paths.length >= 20);
  const missing = paths.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
  assert.deepEqual(missing, []);
});

test('entry points stay short and keep the mandatory gates', () => {
  const agents = read('AGENTS.md');
  const bootstrap = read('.cursor/skills/ledgercraft-bootstrap/SKILL.md');
  const guide = read('.cursor/rules/project-guide.mdc');
  assert.ok(Buffer.byteLength(agents) < 12000, 'AGENTS.md grew past the router budget');
  assert.ok(Buffer.byteLength(bootstrap) < 4000, 'bootstrap grew past the start-procedure budget');
  assert.ok(Buffer.byteLength(guide) < 2500, 'project guide grew past the authority budget');
  assert.match(agents, /docs\/agent\/CODEMAP\.md/);
  assert.match(bootstrap, /AGENTS\.md/);
  assert.equal(agents.includes('Second-month'), false);
  assert.equal(guide.includes('createClient'), false);
  assert.match(read('docs/PIPELINE.md'), /at most 2 delta re-review rounds/);
  assert.equal(read('.cursor/skills/ledgercraft-invariants/SKILL.md').includes('0007_quotes.sql` is the latest'), false);
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /pnpm lint/);
  assert.match(ci, /pnpm test:run/);
  assert.match(ci, /pnpm test:api && pnpm test:contracts && pnpm type-check:api/);
  assert.match(ci, /npm test -- --ci --watchAll=false/);
});

test('the efficiency schema keeps proxies separate from usage', () => {
  const schema = JSON.parse(read('docs/agent/efficiency-summary.schema.json'));
  assert.ok(schema.required.includes('proxies'));
  assert.ok(schema.required.includes('usage'));
  assert.equal(schema.properties.proxies.required.includes('tokenEquivalentEstimate'), true);
  assert.equal(schema.properties.usage.required.includes('inputTokens'), true);
  assert.match(read('docs/agent/EFFICIENCY.md'), /not tokens spent/);
});
