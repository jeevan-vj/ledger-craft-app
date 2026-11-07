import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';
import { bankAccounts, bankTransactions } from './bank';
export const bankFeedConnections = sqliteTable('bank_feed_connections', {
 organisationId:text('organisation_id').primaryKey().references(()=>organisations.id),userId:text('user_id').notNull().references(()=>users.id),
 status:text('status').notNull().default('connected'),lastAttemptAt:integer('last_attempt_at',{mode:'timestamp_ms'}),lastSyncedAt:integer('last_synced_at',{mode:'timestamp_ms'}),
},t=>[check('bank_feed_connection_status_check',sql`${t.status} IN ('connected','revoked','disconnected')`)]);
export const bankFeedAccounts = sqliteTable('bank_feed_accounts',{
 id:text('id').$defaultFn(()=>crypto.randomUUID()).primaryKey(),organisationId:text('organisation_id').notNull().references(()=>organisations.id),
 externalId:text('external_id').notNull(),bankAccountId:text('bank_account_id').notNull(),name:text('name').notNull(),institution:text('institution').notNull(),
 status:text('status').notNull(),currency:text('currency').notNull(),lastSyncedAt:integer('last_synced_at',{mode:'timestamp_ms'}),
},t=>[uniqueIndex('bank_feed_accounts_external_uidx').on(t.organisationId,t.externalId),foreignKey({columns:[t.organisationId,t.bankAccountId],foreignColumns:[bankAccounts.organisationId,bankAccounts.id]}).onDelete('restrict'),check('bank_feed_accounts_status_check',sql`${t.status} IN ('ACTIVE','INACTIVE')`)]);
export const bankFeedTransactions = sqliteTable('bank_feed_transactions',{
 id:text('id').$defaultFn(()=>crypto.randomUUID()).primaryKey(),organisationId:text('organisation_id').notNull().references(()=>organisations.id),externalId:text('external_id').notNull(),
 bankAccountId:text('bank_account_id').notNull(),transactionId:text('transaction_id').notNull(),
},t=>[uniqueIndex('bank_feed_transactions_external_uidx').on(t.organisationId,t.externalId),foreignKey({columns:[t.organisationId,t.bankAccountId],foreignColumns:[bankAccounts.organisationId,bankAccounts.id]}).onDelete('restrict'),foreignKey({columns:[t.organisationId,t.transactionId],foreignColumns:[bankTransactions.organisationId,bankTransactions.id]}).onDelete('restrict')]);
