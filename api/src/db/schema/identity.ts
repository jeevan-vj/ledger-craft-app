import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const users = sqliteTable('users', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  expiresAt: timestamptz('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
}, table => [index('sessions_user_id_idx').on(table.userId)]);

export const authAccounts = sqliteTable(
  'auth_accounts',
  {
    id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    issuer: text('issuer').notNull().default('credential'),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamptz('access_token_expires_at'),
    refreshTokenExpiresAt: timestamptz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
    updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
  },
  (table) => ({
    providerAccount: uniqueIndex('auth_accounts_provider_account_id_uidx').on(table.providerId, table.accountId),
  }),
);

export const verifications = sqliteTable('verifications', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
});

export const organisations = sqliteTable('organisations', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
  archivedAt: timestamptz('archived_at'),
});

export const organisationMemberships = sqliteTable('organisation_memberships', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('owner'),
  removedAt: timestamptz('removed_at'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('organisation_memberships_org_id_uidx').on(table.organisationId, table.id),
  index('organisation_memberships_org_idx').on(table.organisationId),
  uniqueIndex('organisation_memberships_organisationId_userId_uidx').on(table.organisationId, table.userId),
]);

export const activeOrganisationSelections = sqliteTable('active_organisation_selections', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
});

export const organisationInvitations = sqliteTable('organisation_invitations', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  status: text('status').notNull().default('pending'),
  invitedByUserId: text('invited_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamptz('expires_at').notNull(),
  acceptedAt: timestamptz('accepted_at'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, table => [
  index('organisation_invitations_org_idx').on(table.organisationId),
  index('organisation_invitations_email_idx').on(table.email),
]);
