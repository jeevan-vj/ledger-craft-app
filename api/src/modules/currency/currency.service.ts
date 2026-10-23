import { currencySettingsSchema, localizationSettingsSchema, type CreateExchangeRateRequest, type UpdateCurrencySettingsRequest, type UpsertCurrencyRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal } from '../invoices/money';
import * as repo from './currency.repository';

function assertTimezone(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date()); }
  catch { throw new HTTPException(400, { message: 'Timezone must be a valid IANA timezone' }); }
}

export async function getSettingsInTx(tx: Database, organisationId: string) {
  const localization = await repo.getLocalization(tx, organisationId);
  return currencySettingsSchema.parse({
    localization,
    currencies: await repo.listCurrencies(tx, organisationId),
    rates: await repo.listRates(tx, organisationId),
  });
}

export async function getSettingsForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, (tx, ctx) => getSettingsInTx(tx, ctx.organisationId));
}

export async function updateSettingsForUser(db: Database, userId: string, input: UpdateCurrencySettingsRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (input.timezone) assertTimezone(input.timezone);
    const current = await repo.getLocalization(tx, ctx.organisationId);
    localizationSettingsSchema.parse({ ...current, ...input });
    if (input.baseCurrency && input.baseCurrency !== current.baseCurrency) {
      const currency = await repo.getCurrency(tx, ctx.organisationId, input.baseCurrency);
      if (!currency?.enabled) throw new HTTPException(400, { message: 'Base currency must be enabled in the catalogue' });
      if (await repo.hasFinancialData(tx, ctx.organisationId)) {
        throw new HTTPException(409, { message: 'Base currency cannot change after financial documents exist' });
      }
    }
    await repo.updateLocalization(tx, ctx.organisationId, input);
    return getSettingsInTx(tx, ctx.organisationId);
  });
}

export async function upsertCurrencyForUser(db: Database, userId: string, input: UpsertCurrencyRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const localization = await repo.getLocalization(tx, ctx.organisationId);
    const existing = await repo.getCurrency(tx, ctx.organisationId, input.code);
    if (input.code === localization.baseCurrency && !input.enabled) throw new HTTPException(409, { message: 'Base currency cannot be disabled' });
    if (existing && existing.precision !== input.precision && await repo.currencyHasUsage(tx, ctx.organisationId, input.code)) {
      throw new HTTPException(409, { message: 'Currency precision cannot change after an exchange rate has been used' });
    }
    await repo.upsertCurrency(tx, ctx.organisationId, input);
    return getSettingsInTx(tx, ctx.organisationId);
  });
}

export async function createRateForUser(db: Database, userId: string, input: CreateExchangeRateRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const localization = await repo.getLocalization(tx, ctx.organisationId);
    if (input.currencyCode === localization.baseCurrency) throw new HTTPException(400, { message: 'Base currency does not need an exchange rate' });
    const currency = await repo.getCurrency(tx, ctx.organisationId, input.currencyCode);
    if (!currency?.enabled) throw new HTTPException(400, { message: 'Currency must be enabled before adding a rate' });
    if (await repo.findExactRate(tx, ctx.organisationId, input.currencyCode, input.effectiveDate)) {
      throw new HTTPException(409, { message: 'A rate already exists for this currency and date' });
    }
    await repo.insertRate(tx, ctx, localization.baseCurrency, input);
    return getSettingsInTx(tx, ctx.organisationId);
  });
}

export async function deleteRateForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const result = await repo.deleteUnusedRate(tx, ctx.organisationId, id);
    if (result === 'used') throw new HTTPException(409, { message: 'A rate used by a financial document is immutable' });
    if (result === 'missing') throw new HTTPException(404, { message: 'Exchange rate not found' });
  });
}

export async function resolveDocumentCurrency(tx: Database, organisationId: string, currencyCode: string | undefined, date: string) {
  const localization = await repo.getLocalization(tx, organisationId);
  const code = currencyCode ?? localization.baseCurrency;
  const currency = await repo.getCurrency(tx, organisationId, code);
  if (!currency?.enabled) throw new HTTPException(400, { message: 'Currency is not enabled for this organisation' });
  const base = await repo.getCurrency(tx, organisationId, localization.baseCurrency);
  if (!base) throw new Error('Base currency catalogue entry missing');
  if (code === localization.baseCurrency) return { currency, base, rate: '1', rateId: null };
  const rate = await repo.findRate(tx, organisationId, code, localization.baseCurrency, date);
  if (!rate) throw new HTTPException(422, { message: `Add a reviewed ${code} to ${localization.baseCurrency} rate dated on or before ${date}` });
  return { currency, base, rate: rate.rate, rateId: rate.id };
}

export function roundAt(value: string | ReturnType<typeof decimal>, precision: number) {
  return decimal(value).toFixed(precision);
}

export function convertToBase(value: string, rate: string, precision: number) {
  return decimal(value).mul(rate).toFixed(precision);
}

export { repo as currencyRepository };
