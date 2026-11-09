import { HIDE_METADATA } from 'better-auth';
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api';
import { getBetterAuthUrl, getGoogleOAuthCredentials } from '../../env';
import { verifyGoogleIdToken } from './google-id-token';

export const mobileGoogleCallback = 'easybizinvoice://auth/google';

type GoogleAccount = {
  providerId?: string;
  userId?: string;
  idToken?: string | null;
};

type AccountAdapter = {
  findUserById: (id: string) => Promise<{ emailVerified?: boolean } | null>;
  findAccounts: (userId: string) => Promise<Array<{ id: string; providerId: string }>>;
  deleteAccount: (id: string) => Promise<unknown>;
  deleteUserSessions: (userId: string) => Promise<unknown>;
  findVerificationValue: (identifier: string) => Promise<{ value: string; expiresAt: Date } | null>;
  createVerificationValue: (data: { identifier: string; value: string; expiresAt: Date }) => Promise<unknown>;
  consumeVerificationValue: (identifier: string) => Promise<unknown>;
};

type MobileBind = { mobileState: string; verifierHash: string };
type MobileCode = MobileBind & { cookieName: string; cookieValue: string };

const mobileBinds = new Map<string, MobileBind>();

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('base64url');
}

function sameString(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index]! ^ b[index]!;
  return diff === 0;
}

export function exactMobileGooglePath(url: string): URL | null {
  const withoutHash = url.split('#')[0] ?? '';
  const queryIndex = withoutHash.indexOf('?');
  const path = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  if (path !== mobileGoogleCallback) return null;
  try {
    return new URL(withoutHash);
  } catch {
    return null;
  }
}

function googleCallbackUrl(): string {
  return `${getBetterAuthUrl().replace(/\/$/, '')}/api/auth/callback/google`;
}

function allowedGoogleAuthorizeUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') return false;
  if (url.pathname !== '/o/oauth2/v2/auth' && url.pathname !== '/o/oauth2/auth') return false;
  return url.searchParams.get('redirect_uri') === googleCallbackUrl() && Boolean(url.searchParams.get('state'));
}

async function verifiedGoogleClaims(idToken: string | null | undefined): Promise<Record<string, unknown> | null> {
  const credentials = getGoogleOAuthCredentials();
  if (!credentials || !idToken) return null;
  const payload = await verifyGoogleIdToken(idToken, credentials.clientId);
  if (!payload || payload.email_verified !== true) return null;
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null;
  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) return null;
  return payload;
}

export async function googleProfileFromIdToken(token: { idToken?: string | null }) {
  const payload = await verifiedGoogleClaims(token.idToken);
  if (!payload || typeof payload.email !== 'string') return null;
  const email = payload.email;
  const name = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : email.split('@')[0] || 'Owner';
  const aud = Array.isArray(payload.aud) ? String(payload.aud[0] ?? '') : String(payload.aud);
  return {
    user: {
      name,
      email,
      image: typeof payload.picture === 'string' ? payload.picture : undefined,
      emailVerified: payload.email_verified === true,
    },
    data: {
      aud,
      azp: typeof payload.azp === 'string' ? payload.azp : aud,
      email,
      email_verified: payload.email_verified === true,
      exp: Number(payload.exp),
      family_name: typeof payload.family_name === 'string' ? payload.family_name : '',
      given_name: typeof payload.given_name === 'string' ? payload.given_name : '',
      iat: typeof payload.iat === 'number' ? payload.iat : 0,
      iss: String(payload.iss),
      name,
      picture: typeof payload.picture === 'string' ? payload.picture : '',
      sub: String(payload.sub),
    },
  };
}

export async function stripUnverifiedPasswordAccess(account: GoogleAccount, adapter: AccountAdapter | undefined): Promise<void> {
  if (account.providerId !== 'google' || !account.userId || !adapter) return;
  const user = await adapter.findUserById(account.userId);
  if (!user || user.emailVerified === true) return;
  const accounts = await adapter.findAccounts(account.userId);
  for (const existing of accounts) {
    if (existing.providerId === 'credential') await adapter.deleteAccount(existing.id);
  }
  await adapter.deleteUserSessions(account.userId);
}

function sessionCookie(headers: Headers): { name: string; value: string } | null {
  const listed = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const candidates = listed.length > 0 ? listed : [headers.get('set-cookie') ?? ''];
  for (const header of candidates) {
    const match = /((?:__Secure-)?better-auth\.session_token)=([^;\s]+)/.exec(header);
    if (match?.[1] && match[2]) return { name: match[1], value: match[2] };
  }
  return null;
}

function stripSessionFromRedirect(headers: Headers, location: string): void {
  headers.delete('set-auth-token');
  headers.delete('set-cookie');
  headers.set('location', location);
}

async function googleProviderConfigured(socialProviders: unknown): Promise<boolean> {
  if (!Array.isArray(socialProviders)) return false;
  for (const entry of socialProviders) {
    const provider = typeof entry === 'function' ? await entry() : entry;
    if (provider && typeof provider === 'object' && 'id' in provider && provider.id === 'google') return true;
  }
  return false;
}

const googleProviderPlugin = () => ({
  id: 'google-sign-in',
  endpoints: {
    providers: createAuthEndpoint('/providers', {
      method: 'GET',
      metadata: HIDE_METADATA,
    }, async (ctx) => ctx.json({ google: await googleProviderConfigured(ctx.context.socialProviders) })),
    browser: createAuthEndpoint('/google/browser', {
      method: 'GET',
      metadata: HIDE_METADATA,
    }, async (ctx) => {
      if (!getGoogleOAuthCredentials()) {
        throw APIError.from('NOT_FOUND', {
          message: 'Google sign-in is not configured.',
          code: 'GOOGLE_SIGN_IN_DISABLED',
        });
      }
      const requestUrl = ctx.request?.url;
      if (!requestUrl) throw APIError.from('BAD_REQUEST', { message: 'Invalid authorization URL.', code: 'INVALID_AUTHORIZATION_URL' });
      const authorizationURL = new URL(requestUrl).searchParams.get('authorizationURL') ?? '';
      if (!allowedGoogleAuthorizeUrl(authorizationURL)) {
        throw APIError.from('BAD_REQUEST', {
          message: 'Invalid authorization URL.',
          code: 'INVALID_AUTHORIZATION_URL',
        });
      }
      const state = new URL(authorizationURL).searchParams.get('state') ?? '';
      const stateCookie = ctx.context.createAuthCookie('state', { maxAge: 300 });
      await ctx.setSignedCookie(stateCookie.name, state, ctx.context.secret, stateCookie.attributes);
      throw ctx.redirect(authorizationURL);
    }),
    mobileSession: createAuthEndpoint('/google/mobile-session', {
      method: 'POST',
      metadata: HIDE_METADATA,
    }, async (ctx) => {
      const parsedBody = ctx.body && typeof ctx.body === 'object'
        ? ctx.body as { code?: unknown; state?: unknown; verifier?: unknown }
        : await ctx.request?.clone().json().catch(() => ({})) as { code?: unknown; state?: unknown; verifier?: unknown } | undefined;
      const body = parsedBody;
      const code = typeof body?.code === 'string' ? body.code : '';
      const state = typeof body?.state === 'string' ? body.state : '';
      const verifier = typeof body?.verifier === 'string' ? body.verifier : '';
      const adapter = ctx.context.internalAdapter as AccountAdapter;
      const row = code ? await adapter.findVerificationValue(`google-mobile-code:${code}`) : null;
      const parsed = row ? JSON.parse(row.value) as MobileCode : null;
      const verifierHash = verifier ? await sha256Base64Url(verifier) : '';
      if (!parsed || parsed.mobileState !== state || !sameString(parsed.verifierHash, verifierHash)) {
        throw APIError.from('UNAUTHORIZED', {
          message: 'Google sign-in did not finish. Try again.',
          code: 'GOOGLE_SIGN_IN_EXPIRED',
        });
      }
      if (!await adapter.consumeVerificationValue(`google-mobile-code:${code}`)) {
        throw APIError.from('UNAUTHORIZED', {
          message: 'Google sign-in did not finish. Try again.',
          code: 'GOOGLE_SIGN_IN_EXPIRED',
        });
      }
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      ctx.setHeader('set-cookie', `${parsed.cookieName}=${parsed.cookieValue}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      ctx.setHeader('set-auth-token', parsed.cookieValue);
      return ctx.json({ status: true });
    }),
  },
  hooks: {
    before: [
      {
        matcher(context: { path?: string }) {
          return context.path === '/sign-in/social';
        },
        handler: createAuthMiddleware(async (ctx) => {
          const provider = ctx.body && typeof ctx.body === 'object' && 'provider' in ctx.body
            ? (ctx.body as { provider?: unknown }).provider
            : undefined;
          if (provider !== 'google') return;
          if (await googleProviderConfigured(ctx.context.socialProviders)) return;
          throw APIError.from('NOT_FOUND', {
            message: 'Google sign-in is not configured.',
            code: 'GOOGLE_SIGN_IN_DISABLED',
          });
        }),
      },
      {
        matcher(context: { path?: string }) {
          return context.path?.startsWith('/callback/') === true;
        },
        handler: createAuthMiddleware(async (ctx) => {
          const requestUrl = ctx.request?.url;
          if (!requestUrl || !new URL(requestUrl).pathname.endsWith('/callback/google')) return;
          const oauthState = new URL(requestUrl).searchParams.get('state');
          if (!oauthState) return;
          const row = await (ctx.context.internalAdapter as AccountAdapter).findVerificationValue(oauthState);
          if (!row) return;
          const stored = JSON.parse(row.value) as { callbackURL?: unknown; verifierHash?: unknown };
          if (typeof stored.callbackURL !== 'string' || typeof stored.verifierHash !== 'string') return;
          const callback = exactMobileGooglePath(stored.callbackURL);
          const mobileState = callback?.searchParams.get('state');
          if (!mobileState) return;
          mobileBinds.set(oauthState, { mobileState, verifierHash: stored.verifierHash });
        }),
      },
    ],
    after: [{
      matcher(context: { path?: string }) {
        return context.path?.startsWith('/callback/') === true;
      },
      handler: createAuthMiddleware(async (ctx) => {
        const requestUrl = ctx.request?.url;
        if (!requestUrl || !new URL(requestUrl).pathname.endsWith('/callback/google')) return;
        const headers = ctx.context.responseHeaders;
        const location = headers?.get('location');
        if (!headers || !location) return;
        const oauthState = new URL(requestUrl).searchParams.get('state') ?? '';
        const bind = mobileBinds.get(oauthState);
        mobileBinds.delete(oauthState);
        const callback = exactMobileGooglePath(location);
        if (!callback) return;
        if (callback.searchParams.get('error')) {
          stripSessionFromRedirect(headers, location);
          return;
        }
        const session = sessionCookie(headers);
        const returnedState = callback.searchParams.get('state');
        if (!bind || !session || returnedState !== bind.mobileState) {
          const next = new URL(mobileGoogleCallback);
          next.searchParams.set('error', 'state_mismatch');
          if (returnedState) next.searchParams.set('state', returnedState);
          stripSessionFromRedirect(headers, next.toString());
          return;
        }
        const code = randomToken();
        await (ctx.context.internalAdapter as AccountAdapter).createVerificationValue({
          identifier: `google-mobile-code:${code}`,
          value: JSON.stringify({ ...bind, cookieName: session.name, cookieValue: session.value }),
          expiresAt: new Date(Date.now() + 60 * 1000),
        });
        const next = new URL(mobileGoogleCallback);
        next.searchParams.set('code', code);
        next.searchParams.set('state', bind.mobileState);
        stripSessionFromRedirect(headers, next.toString());
      }),
    }],
  },
});

export function googleSocialProviders() {
  const credentials = getGoogleOAuthCredentials();
  if (!credentials) return undefined;
  return {
    google: {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      getUserInfo: googleProfileFromIdToken,
    },
  };
}

export function googleAuthPlugins() {
  return [googleProviderPlugin()];
}
