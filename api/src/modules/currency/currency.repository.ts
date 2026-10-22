import type {
  CreateExchangeRateRequest,
  CurrencyDefinitionDto,
  ExchangeRateDto,
  LocalizationSettingsDto,
  UpdateCurrencySettingsRequest,
  UpsertCurrencyRequest,
} from '@ledgercraft/contracts';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankTransfers } from '../../db/schema/bank';
import { exchangeRates, exchangeRateUsage, organisationCurrencies, organisationLocalizationSettings } from '../../db/schema/currency';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { bills } from '../../db/schema/purchases';

export const DEFAULT_CURRENCIES: Array<Omit<CurrencyDefinitionDto, 'isBase'>> = [
  { code: 'NZD', name: 'New Zealand dollar', precision: 2, symbol: '$', symbolPosition: 'before', enabled: true },
  { code: 'AUD', name: 'Australian dollar', precision: 2, symbol: 'A$', symbolPosition: 'before', enabled: true },
  { code: 'USD', name: 'US dollar', precision: 2, symbol: 'US$', symbolPosition: 'before', enabled: true },
  { code: 'EUR', name: 'Euro', precision: 2, symbol: '€', symbolPosition: 'before', enabled: true },
  { code: 'JPY', name: 'Japanese yen', precision: 0, symbol: '¥', symbolPosition: 'before', enabled: true },
  { code: 'BHD', name: 'Bahraini dinar', precision: 3, symbol: 'BD', symbolPosition: 'after', enabled: true },
];

export async function ensureDefaults(tx: Database, organisationId: string) {
  await tx.insert(organisationLocalizationSettings).values({ organisationId }).onConflictDoNothing();
  for (const currency of DEFAULT_CURRENCIES) {
    await tx.insert(organisationCurrencies).values({ organisationId, ...currency }).onConflictDoNothing();
  }
}

export async function getLocalization(tx: Database, organisationId: string): Promise<LocalizationSettingsDto> {
  await ensureDefaults(tx, organisationId);
  const [row] = await tx.select().from(organisationLocalizationSettings).where(eq(organisationLocalizationSettings.organisationId, organisationId));
  if (!row) throw new Error('Localization settings missing');
  return {
    baseCurrency: row.baseCurrency, locale: row.locale, language: row.language, timezone: row.timezone,
    dateFormat: row.dateFormat as LocalizationSettingsDto['dateFormat'], numberFormat: row.numberFormat as LocalizationSettingsDto['numberFormat'],
    financialYearStartMonth: row.financialYearStartMonth, financialYearStartDay: row.financialYearStartDay,
    percentPosition: row.percentPosition as LocalizationSettingsDto['percentPosition'],
  };
}

export async function updateLocalization(tx: Database, organisationId: string, input: UpdateCurrencySettingsRequest) {
  await ensureDefaults(tx, organisationId);
  await tx.update(organisationLocalizationSettings).set({ ...input, updatedAt: new Date() })
    .where(eq(organisationLocalizationSettings.organisationId, organisationId));
  return getLocalization(tx, organisationId);
}

export async function listCurrencies(tx: Database, organisationId: string) {
  const localization = await getLocalization(tx, organisationId);
  const rows = await tx.select().from(organisationCurrencies)
    .where(eq(organisationCurrencies.organisationId, organisationId)).orderBy(asc(organisationCurrencies.code));
  return rows.map((row) => ({
    code: row.code, name: row.name, precision: row.precision, symbol: row.symbol,
    symbolPosition: row.symbolPosition as CurrencyDefinitionDto['symbolPosition'], enabled: row.enabled,
    isBase: row.code === localization.baseCurrency,
  }));
}

export async function getCurrency(tx: Database, organisationId: string, code: string) {
  await ensureDefaults(tx, organisationId);
  const [row] = await tx.select().from(organisationCurrencies).where(and(
    eq(organisationCurrencies.organisationId, organisationId), eq(organisationCurrencies.code, code),
  ));
  return row;
}

export async function upsertCurrency(tx: Database, organisationId: string, input: UpsertCurrencyRequest) {
  await tx.insert(organisationCurrencies).values({ organisationId, ...input }).onConflictDoUpdate({
    target: [organisationCurrencies.organisationId, organisationCurrencies.code],
    set: { name: input.name, precision: input.precision, symbol: input.symbol, symbolPosition: input.symbolPosition, enabled: input.enabled, updatedAt: new Date() },
  });
}

export async function listRates(tx: Database, organisationId: string): Promise<ExchangeRateDto[]> {
  const rows = await tx.select().from(exchangeRates).where(eq(exchangeRates.organisationId, organisationId))
    .orderBy(desc(exchangeRates.effectiveDate), asc(exchangeRates.currencyCode));
  const usages = await tx.select({ exchangeRateId: exchangeRateUsage.exchangeRateId, count: sql<number>`count(*)` })
    .from(exchangeRateUsage).where(eq(exchangeRateUsage.organisationId, organisationId)).groupBy(exchangeRateUsage.exchangeRateId);
  const counts = new Map(usages.map((usage) => [usage.exchangeRateId, Number(usage.count)]));
  return rows.map((row) => ({
    id: row.id, currencyCode: row.currencyCode, baseCurrency: row.baseCurrency, effectiveDate: row.effectiveDate,
    rate: row.rate, usageCount: counts.get(row.id) ?? 0, immutable: true as const,
    createdAt: row.createdAt.toISOString(), createdByUserId: row.createdByUserId,
  }));
}

export async function insertRate(tx: Database, ctx: { organisationId: string; userId: string }, baseCurrency: string, input: CreateExchangeRateRequest) {
  const [row] = await tx.insert(exchangeRates).values({
    organisationId: ctx.organisationId, createdByUserId: ctx.userId, baseCurrency,
    currencyCode: input.currencyCode, effectiveDate: input.effectiveDate, rate: input.rate,
  }).returning();
  if (!row) throw new Error('Exchange rate was not created');
  return row;
}

export async function findRate(tx: Database, organisationId: string, currencyCode: string, baseCurrency: string, date: string) {
  const [row] = await tx.select().from(exchangeRates).where(and(
    eq(exchangeRates.organisationId, organisationId), eq(exchangeRates.currencyCode, currencyCode),
    eq(exchangeRates.baseCurrency, baseCurrency), lte(exchangeRates.effectiveDate, date),
  )).orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.createdAt)).limit(1);
  return row;
}

export async function findExactRate(tx: Database, organisationId: string, currencyCode: string, date: string) {
  const [row] = await tx.select().from(exchangeRates).where(and(
    eq(exchangeRates.organisationId, organisationId), eq(exchangeRates.currencyCode, currencyCode),
    eq(exchangeRates.effectiveDate, date),
  )).limit(1);
  return row;
}

export async function getRateById(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select().from(exchangeRates).where(and(
    eq(exchangeRates.organisationId, organisationId), eq(exchangeRates.id, id),
  )).limit(1);
  return row;
}

export async function recordRateUsage(tx: Database, organisationId: string, exchangeRateId: string, documentType: 'invoice' | 'bill' | 'expense' | 'transfer', documentId: string) {
  await tx.insert(exchangeRateUsage).values({ organisationId, exchangeRateId, documentType, documentId });
}

export async function deleteUnusedRate(tx: Database, organisationId: string, id: string) {
  const [usage] = await tx.select({ count: sql<number>`count(*)` }).from(exchangeRateUsage).where(and(
    eq(exchangeRateUsage.organisationId, organisationId), eq(exchangeRateUsage.exchangeRateId, id),
  ));
  if (Number(usage?.count ?? 0) > 0) return 'used' as const;
  const deleted = await tx.delete(exchangeRates).where(and(eq(exchangeRates.organisationId, organisationId), eq(exchangeRates.id, id))).returning({ id: exchangeRates.id });
  return deleted.length ? 'deleted' as const : 'missing' as const;
}

export async function hasFinancialData(tx: Database, organisationId: string) {
  const tables = [invoices, bills, expenses, bankTransfers] as const;
  for (const table of tables) {
    const [row] = await tx.select({ count: sql<number>`count(*)` }).from(table).where(eq(table.organisationId, organisationId));
    if (Number(row?.count ?? 0) > 0) return true;
  }
  return false;
}

export async function currencyHasUsage(tx: Database, organisationId: string, code: string) {
  const [row] = await tx.select({ count: sql<number>`count(*)` }).from(exchangeRateUsage)
    .innerJoin(exchangeRates, and(eq(exchangeRates.organisationId, exchangeRateUsage.organisationId), eq(exchangeRates.id, exchangeRateUsage.exchangeRateId)))
    .where(and(eq(exchangeRateUsage.organisationId, organisationId), eq(exchangeRates.currencyCode, code)));
  return Number(row?.count ?? 0) > 0;
}
