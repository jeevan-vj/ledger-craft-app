import test from 'node:test';
import assert from 'node:assert/strict';
import { proofBrowserOptions, localProofOrigin } from './proof-runtime.mjs';

test('portable proof defaults use the Playwright-installed browser', () => {
  assert.equal(proofBrowserOptions({}).executablePath, undefined);
});
test('an explicit Linux or custom browser remains supported', () => {
  assert.equal(proofBrowserOptions({ PROOF_BROWSER_PATH: '/custom/chromium' }).executablePath, '/custom/chromium');
});
test('proof runs accept alternate loopback ports but refuse hosted targets', () => {
  assert.equal(localProofOrigin('http://127.0.0.1:8092'), 'http://127.0.0.1:8092');
  assert.equal(localProofOrigin('http://localhost:8080/'), 'http://localhost:8080');
  assert.throws(() => localProofOrigin('https://easybizinvoice.com'), /loopback/);
  assert.throws(() => localProofOrigin('http://localhost.evil.example'), /loopback/);
  assert.throws(() => localProofOrigin('http://name:secret@localhost:8080'), /credentials/);
});

test('network settling waits for an in-flight API read before navigating', async () => {
  const { EventEmitter } = await import('node:events');
  const { observeProofNetwork } = await import('./proof-runtime.mjs');
  const page = new EventEmitter();
  const network = observeProofNetwork(page, { quietMs: 5, timeoutMs: 500 });
  const request = { url: () => 'http://localhost:8080/api/invoices' };
  page.emit('request', request);
  let settled = false;
  const waiting = network.settle().then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(settled, false);
  page.emit('requestfinished', request);
  await waiting;
  assert.deepEqual(network.failures, []);
});

test('saved browser state requires a private explicit output directory', async () => {
  const { mkdtemp, stat, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { privateProofDirectory } = await import('./proof-runtime.mjs');
  const root = await mkdtemp(join(tmpdir(), 'proof-output-test-'));
  try {
    await assert.rejects(() => privateProofDirectory(undefined), /explicit output directory/);
    const output = await privateProofDirectory(join(root, 'private'));
    assert.equal((await stat(output)).mode & 0o777, 0o700);
    assert.equal(await privateProofDirectory(output), output);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('saved browser state refuses shared directories and symlink destinations', async () => {
  const { mkdtemp, mkdir, chmod, symlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { privateProofDirectory } = await import('./proof-runtime.mjs');
  const root = await mkdtemp(join(tmpdir(), 'proof-output-test-'));
  try {
    const shared = join(root, 'shared');
    await mkdir(shared); await chmod(shared, 0o755);
    await assert.rejects(() => privateProofDirectory(shared), /owner-only/);
    await symlink(shared, join(root, 'linked'));
    await assert.rejects(() => privateProofDirectory(join(root, 'linked')), /real directory/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('standalone proofs use unique owner-only output directories by default', async () => {
  const { stat, rm } = await import('node:fs/promises');
  const { freshProofDirectory } = await import('./proof-runtime.mjs');
  const first = await freshProofDirectory();
  const second = await freshProofDirectory();
  try {
    assert.notEqual(first, second);
    assert.equal((await stat(first)).mode & 0o777, 0o700);
    assert.equal((await stat(second)).mode & 0o777, 0o700);
    assert.equal(await freshProofDirectory(first), first);
  } finally { await Promise.all([first, second].map(path => rm(path, { recursive: true, force: true }))); }
});
