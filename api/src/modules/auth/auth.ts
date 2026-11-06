import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { Database } from '../../db/client';
import { authAccounts, sessions, users, verifications } from '../../db/schema/identity';
import { getBetterAuthSecret, getBetterAuthTrustedOrigins, getBetterAuthUrl } from '../../env';
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
    account: { modelName: 'auth_accounts' },
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
      customRules: {
        '/reset-password': { window: 60, max: 5 },
        '/verify-email': { window: 60, max: 5 },
      },
    },
    plugins: [bearer()],
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
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
