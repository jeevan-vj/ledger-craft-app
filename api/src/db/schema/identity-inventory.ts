/**
 * W3 identity tables. Better Auth provider accounts must not use `accounts`
 * (that name is the chart of accounts from W2).
 */
export const IDENTITY_COLUMNS = {
  organisations: ['id', 'name', 'created_at', 'updated_at'],
  organisation_memberships: ['id', 'organisation_id', 'user_id', 'role', 'created_at'],
  users: ['id', 'name', 'email', 'email_verified', 'image', 'created_at', 'updated_at'],
  sessions: [
    'id',
    'expires_at',
    'token',
    'created_at',
    'updated_at',
    'ip_address',
    'user_agent',
    'user_id',
  ],
  auth_accounts: [
    'id',
    'issuer',
    'account_id',
    'provider_id',
    'user_id',
    'access_token',
    'refresh_token',
    'id_token',
    'access_token_expires_at',
    'refresh_token_expires_at',
    'scope',
    'password',
    'created_at',
    'updated_at',
  ],
  verifications: ['id', 'identifier', 'value', 'expires_at', 'created_at', 'updated_at'],
} as const;
