import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';
import { invoices } from './invoices';
import { payments } from './payments';
import { receipts } from './receipts';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const stripeConnectedAccounts = sqliteTable('stripe_connected_accounts', {
  organisationId: text('organisation_id').primaryKey().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  stripeAccountId: text('stripe_account_id').notNull(),
  status: text('status', { enum: ['onboarding', 'restricted', 'active', 'disabled'] }).notNull(),
  chargesEnabled: integer('charges_enabled', { mode: 'boolean' }).notNull().default(false),
  payoutsEnabled: integer('payouts_enabled', { mode: 'boolean' }).notNull().default(false),
  detailsSubmitted: integer('details_submitted', { mode: 'boolean' }).notNull().default(false),
  requirementsDue: text('requirements_due', { mode: 'json' }).$type<string[]>().notNull().default([]),
  disabledReason: text('disabled_reason'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [uniqueIndex('stripe_connected_accounts_account_uidx').on(table.stripeAccountId)]);

export const stripeAccountRoutes = sqliteTable('stripe_account_routes', {
  stripeAccountId: text('stripe_account_id').primaryKey(),
  organisationId: text('organisation_id').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [uniqueIndex('stripe_account_routes_org_uidx').on(table.organisationId)]);

export const stripePaymentLinks = sqliteTable('stripe_payment_links', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  invoiceId: text('invoice_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  publicToken: text('public_token').notNull(),
  stripeCheckoutSessionId: text('stripe_checkout_session_id').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  amount: text('amount').notNull(),
  platformFee: text('platform_fee').notNull(),
  currency: text('currency').notNull().default('NZD'),
  checkoutUrl: text('checkout_url').notNull(),
  status: text('status', { enum: ['open', 'paid', 'expired', 'cancelled', 'failed'] }).notNull().default('open'),
  expiresAt: timestamptz('expires_at').notNull(),
  paymentId: text('payment_id'),
  receiptId: text('receipt_id'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('stripe_payment_links_currency_check', sql`currency = 'NZD'`),
  uniqueIndex('stripe_payment_links_org_id_uidx').on(table.organisationId, table.id),
  uniqueIndex('stripe_payment_links_token_uidx').on(table.publicToken),
  uniqueIndex('stripe_payment_links_session_uidx').on(table.stripeCheckoutSessionId),
  uniqueIndex('stripe_payment_links_idempotency_uidx').on(table.organisationId, table.idempotencyKey),
  index('stripe_payment_links_invoice_idx').on(table.organisationId, table.invoiceId),
  foreignKey({ columns: [table.organisationId, table.invoiceId], foreignColumns: [invoices.organisationId, invoices.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.paymentId], foreignColumns: [payments.organisationId, payments.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.receiptId], foreignColumns: [receipts.organisationId, receipts.id] }).onDelete('restrict'),
]);

export const stripeEvents = sqliteTable('stripe_events', {
  eventId: text('event_id').primaryKey(),
  organisationId: text('organisation_id').notNull(),
  eventType: text('event_type').notNull(),
  livemode: integer('livemode', { mode: 'boolean' }).notNull(),
  outcome: text('outcome', { enum: ['processing', 'processed', 'ignored', 'failed'] }).notNull().default('processing'),
  error: text('error'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  processedAt: timestamptz('processed_at'),
}, (table) => [index('stripe_events_org_idx').on(table.organisationId)]);
