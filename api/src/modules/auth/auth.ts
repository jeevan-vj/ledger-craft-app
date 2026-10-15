import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { Database } from '../../db/client';
import { authAccounts, sessions, users, verifications } from '../../db/schema/identity';
import { getBetterAuthSecret, getBetterAuthTrustedOrigins, getBetterAuthUrl } from '../../env';
import { provisionOrganisationForUser } from './provision';

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

export function createAuth(db: Database) {
  return betterAuth({
    secret: getBetterAuthSecret(),
    baseURL: getBetterAuthUrl(),
    trustedOrigins: getBetterAuthTrustedOrigins(),
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: identitySchema,
    }),
    user: { modelName: 'users' },
    session: { modelName: 'sessions' },
    account: { modelName: 'auth_accounts' },
    verification: { modelName: 'verifications' },
    emailAndPassword: {
      enabled: true,
    },
    plugins: [bearer()],
    advanced: {
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
