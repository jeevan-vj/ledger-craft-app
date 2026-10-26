import assert from 'node:assert/strict';
import test from 'node:test';
import { providerSecretWarning } from './provider-secret-readiness.mjs';

test('reports both optional provider groups without exposing values', () => {
  assert.equal(providerSecretWarning([]), 'NON-FATAL provider warning: email unavailable (missing RESEND_API_KEY, RESEND_FROM); AI unavailable (missing OPENAI_API_KEY or XAI_API_KEY)');
});

test('accepts either AI provider and requires both Resend settings', () => {
  assert.equal(providerSecretWarning(['RESEND_API_KEY', 'OPENAI_API_KEY']), 'NON-FATAL provider warning: email unavailable (missing RESEND_FROM)');
  assert.equal(providerSecretWarning(['RESEND_API_KEY', 'RESEND_FROM', 'XAI_API_KEY']), null);
});
