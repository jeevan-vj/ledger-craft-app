import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const businessProfiles = sqliteTable('business_profiles', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zip: text('zip'),
  country: text('country').notNull().default('NZ'),
  taxId: text('tax_id'),
  logoUrl: text('logo_url'),
  website: text('website'),
  defaultTaxRate: text('default_tax_rate'),
  gstRegistrationStatus: text('gst_registration_status', {
    enum: ['unknown', 'registered', 'not_registered'],
  }).notNull().default('unknown'),
  defaultTerms: text('default_terms'),
  paymentTermDays: integer('payment_term_days').notNull().default(30),
  defaultNotes: text('default_notes'),
  bankInfo: text('bank_info'),
  bankAccountName: text('bank_account_name'),
  bankAccountNumber: text('bank_account_number'),
  theme: text('theme', { mode: 'json' }),
  invoiceNumberFormat: text('invoice_number_format'),
  invoiceNumberSequence: integer('invoice_number_sequence'),
  quoteNumberFormat: text('quote_number_format').notNull().default('QUO-{YYYY}-{SEQ}'),
  quoteNumberSequence: integer('quote_number_sequence').notNull().default(1),
  quoteValidityDays: integer('quote_validity_days').notNull().default(30),
  defaultQuoteKind: text('default_quote_kind', { enum: ['quote', 'estimate'] }).notNull().default('quote'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('business_profiles_payment_term_days_check', sql`payment_term_days >= 0 AND payment_term_days <= 365`),
  check('business_profiles_gst_registration_status_check', sql`gst_registration_status IN ('unknown', 'registered', 'not_registered')`),
  check('business_profiles_quote_validity_days_check', sql`quote_validity_days >= 1 AND quote_validity_days <= 365`),
  check('business_profiles_default_quote_kind_check', sql`default_quote_kind IN ('quote', 'estimate')`),
  uniqueIndex('business_profiles_org_id_uidx').on(table.organisationId, table.id),
  index('business_profiles_org_idx').on(table.organisationId),
  uniqueIndex('business_profiles_organisationId_uidx').on(table.organisationId),
]);
