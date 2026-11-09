import { expo } from '@better-auth/expo';
import { HIDE_METADATA } from 'better-auth';
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api';
import { getGoogleOAuthCredentials } from '../../env';

type GoogleClaims = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
};

type GoogleAccount = {
  providerId?: string;
  idToken?: string | null;
};

export function readGoogleIdTokenClaims(idToken: string | null | undefined): GoogleClaims | null {
  if (!idToken) return null;
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleClaims;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function googleEmailIsVerified(claims: GoogleClaims | null): boolean {
  return Boolean(
    claims
    && claims.email_verified === true
    && typeof claims.email === 'string'
    && claims.email.includes('@')
    && typeof claims.sub === 'string'
    && claims.sub.trim().length > 0,
  );
}

export async function googleProfileFromIdToken(token: { idToken?: string | null }) {
  const claims = readGoogleIdTokenClaims(token.idToken);
  if (!googleEmailIsVerified(claims) || !claims || typeof claims.email !== 'string') return null;
  const email = claims.email;
  const subject = claims.sub;
  if (typeof subject !== 'string') return null;
  const name = typeof claims.name === 'string' && claims.name.trim().length > 0 ? claims.name : email.split('@')[0] || 'Owner';
  const picture = typeof claims.picture === 'string' ? claims.picture : '';
  return {
    user: {
      name,
      email,
      image: picture || undefined,
      emailVerified: true as const,
    },
    data: {
      aud: '',
      azp: '',
      email,
      email_verified: true as const,
      exp: 0,
      family_name: '',
      given_name: '',
      iat: 0,
      iss: 'https://accounts.google.com',
      name,
      picture,
      sub: subject,
    },
  };
}

export function rejectUnverifiedGoogleAccount(account: GoogleAccount) {
  if (account.providerId !== 'google') return { data: account };
  if (!googleEmailIsVerified(readGoogleIdTokenClaims(account.idToken))) return false;
  return { data: account };
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
  },
  hooks: {
    before: [{
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
      // An unverified Google email never becomes a profile. trustedProviders
      // would otherwise treat Google as trusted even when email_verified is false.
      getUserInfo: googleProfileFromIdToken,
    },
  };
}

export function googleAuthPlugins() {
  return [expo(), googleProviderPlugin()];
}
