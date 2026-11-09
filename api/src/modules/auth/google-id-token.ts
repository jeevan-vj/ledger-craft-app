type GoogleJwk = JsonWebKey & { kid?: string };

const jwksCacheMs = 5 * 60 * 1000;
const unknownKidRefetchIntervalMs = 60 * 1000;

let cachedKeys: { expiresAt: number; keys: GoogleJwk[] } | null = null;
let lastUnknownKidRefetchAt = 0;

export function clearGoogleJwksCache(): void {
  cachedKeys = null;
  lastUnknownKidRefetchAt = 0;
}

function decodeBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

async function fetchGoogleKeys(): Promise<GoogleJwk[]> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) return cachedKeys?.keys ?? [];
  const body = await response.json() as { keys?: GoogleJwk[] };
  cachedKeys = { expiresAt: Date.now() + jwksCacheMs, keys: body.keys ?? [] };
  return cachedKeys.keys;
}

async function googlePublicKey(kid: string): Promise<GoogleJwk | null> {
  if (!cachedKeys || cachedKeys.expiresAt <= Date.now()) await fetchGoogleKeys();
  const cached = cachedKeys?.keys.find((key) => key.kid === kid);
  if (cached) return cached;
  const now = Date.now();
  if (now - lastUnknownKidRefetchAt < unknownKidRefetchIntervalMs) return null;
  lastUnknownKidRefetchAt = now;
  const refreshed = await fetchGoogleKeys();
  return refreshed.find((key) => key.kid === kid) ?? null;
}

export async function verifyGoogleIdToken(token: string, audience: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const header = decodeJson<{ alg?: unknown; kid?: unknown }>(parts[0]);
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  const jwk = await googlePublicKey(header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return null;
  const payload = decodeJson<Record<string, unknown>>(parts[1]);
  if (!payload) return null;
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}
