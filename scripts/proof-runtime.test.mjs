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
