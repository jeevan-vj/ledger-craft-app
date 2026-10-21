import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deleteSourceMaps } from './delete-sourcemaps.mjs';
import { decideSourceMapUpload } from './upload-web-sourcemaps.mjs';

test('source map upload waits until the auth token exists', () => {
  assert.deepEqual(decideSourceMapUpload({}), {
    action: 'skip',
    reason: 'SENTRY_AUTH_TOKEN is not set; skipping web source map upload.',
  });
  assert.equal(decideSourceMapUpload({ SENTRY_AUTH_TOKEN: '   ' }).action, 'skip');
});

test('source map upload requires the org and a git release when a token is set', () => {
  assert.equal(decideSourceMapUpload({ SENTRY_AUTH_TOKEN: 'token' }).action, 'fail');
  assert.equal(
    decideSourceMapUpload({ SENTRY_AUTH_TOKEN: 'token', SENTRY_ORG: 'acme' }).action,
    'fail',
  );
  assert.deepEqual(
    decideSourceMapUpload({
      SENTRY_AUTH_TOKEN: 'token',
      SENTRY_ORG: 'acme',
      GITHUB_SHA: 'abc123',
    }),
    { action: 'upload', org: 'acme', project: 'ledgercraft-web', release: 'abc123' },
  );
  assert.equal(
    decideSourceMapUpload({
      SENTRY_AUTH_TOKEN: 'token',
      SENTRY_ORG: 'acme',
      SENTRY_PROJECT: 'custom-web',
      SENTRY_RELEASE: 'release-1',
      GITHUB_SHA: 'ignored',
    }).project,
    'custom-web',
  );
});

test('source map deletion removes only map files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ledgercraft-maps-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'index.js'), 'console.log(1)');
  writeFileSync(join(root, 'assets', 'index.js.map'), '{}');
  writeFileSync(join(root, 'version.json'), '{}');

  assert.equal(deleteSourceMaps(root), 1);
  assert.equal(deleteSourceMaps(root), 0);
  rmSync(root, { recursive: true, force: true });
});
