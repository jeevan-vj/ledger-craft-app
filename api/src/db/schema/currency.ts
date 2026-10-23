import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const organisationLocalizationSettings = sqliteTable('organisation_localization_settings', {
  organisationId: text('organisation_id').primaryKey().references(() => organisations.id, { onDelete: 'cascade' }),
  baseCurrency: text('base_currency').notNull().default('NZD'),
  locale: text('locale').notNull().default('en-NZ'),
  language: text('language').notNull().default('en'),
  timezone: text('timezone').notNull().default('Pacific/Auckland'),
  dateFormat: text('date_format').notNull().default('DD/MM/YYYY'),
  numberFormat: text('number_format').notNull().default('1,234.56'),
  financialYearStartMonth: integer('financial_year_start_month').notNull().default(4),
  financialYearStartDay: integer('financial_year_start_day').notNull().default(1),
  percentPosition: text('percent_position').notNull().default('after'),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('organisation_localization_base_currency_check', sql`${table.baseCurrency} GLOB '[A-Z][A-Z][A-Z]'`),
  check('organisation_localization_financial_month_check', sql`${table.financialYearStartMonth} BETWEEN 1 AND 12`),
  check('organisation_localization_financial_day_check', sql`${table.financialYearStartDay} BETWEEN 1 AND 31`),
]);

export const organisationCurrencies = sqliteTable('organisation_currencies', {
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  precision: integer('precision').notNull(),
  symbol: text('symbol').notNull(),
  symbolPosition: text('symbol_position').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('organisation_currencies_org_code_uidx').on(table.organisationId, table.code),
  index('organisation_currencies_org_enabled_idx').on(table.organisationId, table.enabled),
  check('organisation_currencies_code_check', sql`${table.code} GLOB '[A-Z][A-Z][A-Z]'`),
  check('organisation_currencies_precision_check', sql`${table.precision} BETWEEN 0 AND 4`),
  check('organisation_currencies_symbol_position_check', sql`${table.symbolPosition} IN ('before','after')`),
]);

export const exchangeRates = sqliteTable('exchange_rates', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  currencyCode: text('currency_code').notNull(),
  baseCurrency: text('base_currency').notNull(),
  effectiveDate: text('effective_date').notNull(),
  rate: text('rate').notNull(),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('exchange_rates_org_currency_date_uidx').on(table.organisationId, table.currencyCode, table.effectiveDate),
  uniqueIndex('exchange_rates_org_id_uidx').on(table.organisationId, table.id),
  index('exchange_rates_lookup_idx').on(table.organisationId, table.currencyCode, table.baseCurrency, table.effectiveDate),
  check('exchange_rates_distinct_currency_check', sql`${table.currencyCode} <> ${table.baseCurrency}`),
  check('exchange_rates_rate_check', sql`${table.rate} <> '' AND ${table.rate} NOT GLOB '*[^0-9.]*' AND trim(${table.rate}, '0.') <> ''`),
]);

export const exchangeRateUsage = sqliteTable('exchange_rate_usage', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  exchangeRateId: text('exchange_rate_id').notNull(),
  documentType: text('document_type').notNull(),
  documentId: text('document_id').notNull(),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('exchange_rate_usage_document_uidx').on(table.organisationId, table.documentType, table.documentId),
  index('exchange_rate_usage_rate_idx').on(table.organisationId, table.exchangeRateId),
  foreignKey({ columns: [table.organisationId, table.exchangeRateId], foreignColumns: [exchangeRates.organisationId, exchangeRates.id] }).onDelete('restrict'),
  check('exchange_rate_usage_type_check', sql`${table.documentType} IN ('invoice','bill','expense','transfer')`),
]);
