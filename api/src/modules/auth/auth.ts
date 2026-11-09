import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { Database } from '../../db/client';
import { authAccounts, authRateLimits, sessions, users, verifications } from '../../db/schema/identity';
import { getBetterAuthSecret, getBetterAuthTrustedOrigins, getBetterAuthUrl } from '../../env';
import { googleAuthPlugins, googleSocialProviders, rejectUnverifiedGoogleAccount } from './google';
import { provisionOrganisationForUser } from './provision';
import { scrubText } from '../../observability/scrub';

export type AuthEmail = {
  kind: 'password-reset' | 'email-verification';
  to: string;
  url: string;
};

export type CreateAuthOptions = {
  sendAuthEmail?: (email: AuthEmail) => Promise<void>;
  enableRateLimit?: boolean;
};

const identitySchema = {
  user: users,
  users,
  session: sessions,
  sessions,
  account: authAccounts,
  auth_accounts: authAccounts,
  verification: verifications,
  verifications,
  rateLimit: authRateLimits,
  auth_rate_limits: authRateLimits,
};

export function createAuth(db: Database, options: CreateAuthOptions = {}) {
  const sendAuthEmail = options.sendAuthEmail;
  return betterAuth({
    secret: getBetterAuthSecret(),
    baseURL: getBetterAuthUrl(),
    trustedOrigins: getBetterAuthTrustedOrigins(),
    logger: {
      disableColors: true,
      log: (level, message) => {
        const safe = `[Better Auth] ${scrubText(message)}`;
        if (level === 'error') console.error(safe);
        else if (level === 'warn') console.warn(safe);
        else if (level === 'debug') console.debug(safe);
        else console.info(safe);
      },
    },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: identitySchema,
    }),
    user: {
      modelName: 'users',
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
      },
    },
    session: { modelName: 'sessions' },
    account: {
      modelName: 'auth_accounts',
      accountLinking: {
        enabled: true,
        // Google is trusted only for a verified email claim. Local password
        // sign-up does not require email verification, so a verified Google
        // assertion is what links that existing user. Unverified Google
        // profiles are dropped before this rule can run.
        trustedProviders: ['google'],
        requireLocalEmailVerified: false,
      },
    },
    socialProviders: googleSocialProviders(),
    verification: { modelName: 'verifications' },
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: sendAuthEmail
        ? async ({ user, url }) => sendAuthEmail({ kind: 'password-reset', to: user.email, url })
        : undefined,
    },
    emailVerification: {
      expiresIn: 60 * 60 * 24,
      sendOnSignUp: Boolean(sendAuthEmail),
      requireEmailVerification: false,
      sendVerificationEmail: sendAuthEmail
        ? async ({ user, url }) => sendAuthEmail({ kind: 'email-verification', to: user.email, url })
        : undefined,
    },
    rateLimit: {
      enabled: options.enableRateLimit ?? process.env.NODE_ENV !== 'test',
      storage: 'database',
      modelName: 'auth_rate_limits',
      customRules: {
        '/sign-in/email': { window: 10, max: 3 },
        '/sign-up/email': { window: 10, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
        '/verify-email': { window: 60, max: 5 },
        '/sign-in/social': { window: 60, max: 10 },
        '/expo-authorization-proxy': { window: 60, max: 20 },
      },
    },
    plugins: [bearer(), ...googleAuthPlugins()],
    advanced: {
      // Better Auth skips this in NODE_ENV=test unless it is explicit. Keep the
      // redirect allow-list under integration test as well as in production.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: {
        generateId: 'uuid',
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await provisionOrganisationForUser(db, user);
          },
        },
      },
      account: {
        create: {
          before: async (account) => rejectUnverifiedGoogleAccount(account),
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
