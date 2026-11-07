import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Boot the actual Worker/Identity SQLite Durable Object locally. No provider
// request, deployment, remote AI binding or real credential is involved.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'issue-115-worker-health-'));
process.env.WRANGLER_LOG_PATH = path.join(directory, 'wrangler.log');
process.env.WRANGLER_SEND_METRICS = 'false';
const { unstable_dev } = await import('wrangler');
const config = path.join(directory, 'wrangler.json');
await writeFile(config, JSON.stringify({
  name: 'issue-115-worker-health',
  main: path.join(root, 'deploy/api/worker.ts'),
  compatibility_date: '2026-09-11',
  compatibility_flags: ['nodejs_compat'],
  durable_objects: { bindings: [
    { name: 'IDENTITY', class_name: 'Identity' },
    { name: 'LEDGERS', class_name: 'Ledger' },
  ] },
  migrations: [{ tag: 'sqlite-v1', new_sqlite_classes: ['Identity', 'Ledger'] }],
  rules: [{ type: 'Text', globs: ['**/*.sql'], fallthrough: true }],
}));

test('Worker health reports the same email readiness as the actual mailer', { timeout: 120_000 }, async (t) => {
  try {
    for (const [name, vars, expected] of [
      ['placeholder key', { RESEND_API_KEY: 'your_resend_api_key', RESEND_FROM: 'Test <test@example.test>' }, 'unavailable'],
      ['missing sender', { RESEND_API_KEY: 're_local_readiness_fixture' }, 'unavailable'],
      ['configured settings', { RESEND_API_KEY: 're_local_readiness_fixture', RESEND_FROM: 'Test <test@example.test>' }, 'available'],
    ]) {
      await t.test(name, { timeout: 40_000 }, async () => {
        const worker = await unstable_dev(path.join(root, 'deploy/api/worker.ts'), {
          config, local: true, ip: '127.0.0.1', port: 0, persist: false,
          logLevel: 'error',
          vars: { BETTER_AUTH_SECRET: 'local-worker-health-test-secret-32chars', NODE_ENV: 'test', ...vars },
          experimental: { disableExperimentalWarning: true, testMode: true },
        });
        try {
          const response = await worker.fetch('/api/healthz');
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.status, 'ok');
          assert.equal(body.capabilities.email, expected);
          assert.equal(body.capabilities.ai, 'unavailable');
          assert.equal(body.capabilities.stripe, 'unavailable');
          const rendered = JSON.stringify(body);
          assert.equal(rendered.includes('RESEND_API_KEY'), false);
          assert.equal(rendered.includes('re_local_readiness_fixture'), false);
          assert.equal(rendered.includes('test@example.test'), false);
          const ready = await worker.fetch('/api/readyz');
          assert.equal(ready.status, 200);
          assert.deepEqual(await ready.json(), { status: 'ok' });
        } finally { await worker.stop(); }
      });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
