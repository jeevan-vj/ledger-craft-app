import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGoogleJwksCache, verifyGoogleIdToken } from './google-id-token';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'live-key', alg: 'RS256', use: 'sig' };

function signToken(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: 'live-key' }, key = privateKey): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const encodedHeader = encode(header);
  const encodedPayload = encode(claims);
  if (header.alg === 'none') return `${encodedHeader}.${encodedPayload}.`;
  const signature = createSign('RSA-SHA256').update(`${encodedHeader}.${encodedPayload}`).sign(key).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: 'test-google-client',
    iss: 'https://accounts.google.com',
    sub: 'google-subject',
    email: 'owner@example.com',
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function mockCerts(keys: unknown[][]) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const batch = keys[Math.min(calls.length, keys.length) - 1] ?? [];
    return new Response(JSON.stringify({ keys: batch }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

describe('Google ID token verification', () => {
  afterEach(() => {
    clearGoogleJwksCache();
    vi.restoreAllMocks();
  });

  it('rejects alg none, a bad signature, the wrong audience, the wrong issuer, and an expired token', async () => {
    mockCerts([[publicJwk]]);
    await expect(verifyGoogleIdToken(signToken(claims(), { alg: 'none', typ: 'JWT', kid: 'live-key' }), 'test-google-client')).resolves.toBeNull();
    clearGoogleJwksCache();
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await expect(verifyGoogleIdToken(signToken(claims(), { alg: 'RS256', typ: 'JWT', kid: 'live-key' }, other), 'test-google-client')).resolves.toBeNull();
    clearGoogleJwksCache();
    await expect(verifyGoogleIdToken(signToken(claims({ aud: 'other-client' })), 'test-google-client')).resolves.toBeNull();
    clearGoogleJwksCache();
    await expect(verifyGoogleIdToken(signToken(claims({ iss: 'https://evil.example' })), 'test-google-client')).resolves.toBeNull();
    clearGoogleJwksCache();
    await expect(verifyGoogleIdToken(signToken(claims({ exp: Math.floor(Date.now() / 1000) - 60 })), 'test-google-client')).resolves.toBeNull();
  });

  it('refetches JWKS once for an unknown kid and then rejects without another fetch', async () => {
    const calls = mockCerts([[{ ...publicJwk, kid: 'old-key' }], [{ ...publicJwk, kid: 'still-old' }]]);
    const token = signToken(claims(), { alg: 'RS256', typ: 'JWT', kid: 'rotated-key' });
    await expect(verifyGoogleIdToken(token, 'test-google-client')).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    await expect(verifyGoogleIdToken(token, 'test-google-client')).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });
});
