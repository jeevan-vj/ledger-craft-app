export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export type AiProviderEnv = {
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
};

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? '.data/ledgercraft.sqlite';
}

export function getMigrateDatabaseUrl(): string {
  return process.env.DATABASE_MIGRATE_URL ?? requiredEnv('DATABASE_URL');
}

export function getAdminDatabaseUrl(): string | undefined {
  return process.env.DATABASE_ADMIN_URL;
}

export const apiPort = Number(process.env.API_PORT ?? 3001);
export const apiHost = process.env.API_HOST ?? '127.0.0.1';

const DEV_BETTER_AUTH_SECRET = 'dev-only-better-auth-secret-32ch';

export function getBetterAuthSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required');
  }
  return DEV_BETTER_AUTH_SECRET;
}

export function getBetterAuthUrl(): string {
  return process.env.BETTER_AUTH_URL ?? 'http://localhost:8080';
}

export function getBetterAuthTrustedOrigins(): string[] {
  const fromEnv = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  if (fromEnv) {
    return fromEnv.split(',').map((origin) => origin.trim()).filter(Boolean);
  }
  return [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'exp://127.0.0.1:8081',
    'easybizinvoice://',
  ];
}
