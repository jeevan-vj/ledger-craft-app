import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceMapUploadPlan } from './upload-api-sourcemaps.mjs';

test('skips source map upload when SENTRY_AUTH_TOKEN is absent', () => {
  const plan = sourceMapUploadPlan({});
  assert.equal(plan.action, 'skip');
  assert.match(plan.reason, /SENTRY_AUTH_TOKEN is not set/);
});

test('uploads ledgercraft-api for the git SHA when the token and org are set', () => {
  const plan = sourceMapUploadPlan({
    SENTRY_AUTH_TOKEN: 'sntrys_example',
    SENTRY_ORG: 'easybiz',
    GITHUB_SHA: 'abc123',
  });
  assert.deepEqual(plan, {
    action: 'upload',
    org: 'easybiz',
    project: 'ledgercraft-api',
    release: 'abc123',
  });
});

test('prefers SENTRY_RELEASE and an explicit project slug', () => {
  const plan = sourceMapUploadPlan({
    SENTRY_AUTH_TOKEN: 'sntrys_example',
    SENTRY_ORG: 'easybiz',
    SENTRY_PROJECT: 'custom-api',
    SENTRY_RELEASE: 'release-sha',
    GITHUB_SHA: 'other',
  });
  assert.equal(plan.action, 'upload');
  assert.equal(plan.project, 'custom-api');
  assert.equal(plan.release, 'release-sha');
});

test('fails closed when the token is set without an org or release', () => {
  const missingOrg = sourceMapUploadPlan({ SENTRY_AUTH_TOKEN: 'sntrys_example', GITHUB_SHA: 'abc' });
  assert.equal(missingOrg.action, 'fail');
  assert.match(missingOrg.reason, /SENTRY_ORG/);

  const missingRelease = sourceMapUploadPlan({ SENTRY_AUTH_TOKEN: 'sntrys_example', SENTRY_ORG: 'easybiz' });
  assert.equal(missingRelease.action, 'fail');
  assert.match(missingRelease.reason, /SENTRY_RELEASE/);
});
