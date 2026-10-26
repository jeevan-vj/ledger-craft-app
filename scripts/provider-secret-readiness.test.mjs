import assert from 'node:assert/strict';
import test from 'node:test';
import { providerSecretWarning } from './provider-secret-readiness.mjs';

test('does not report AI unavailable when the Workers AI binding is configured', () => {
  assert.equal(providerSecretWarning([]), 'NON-FATAL provider warning: email unavailable (missing RESEND_API_KEY, RESEND_FROM)');
});

test('treats OpenAI and xAI as optional overrides and requires both Resend settings', () => {
  assert.equal(providerSecretWarning(['RESEND_API_KEY', 'OPENAI_API_KEY']), 'NON-FATAL provider warning: email unavailable (missing RESEND_FROM)');
  assert.equal(providerSecretWarning(['RESEND_API_KEY', 'RESEND_FROM', 'XAI_API_KEY']), null);
});
