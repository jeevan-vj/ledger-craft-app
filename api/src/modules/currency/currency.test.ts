import { currencySettingsSchema, errorEnvelopeSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { convertToBase, roundAt } from './currency.service';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
function cookieHeader(response: Response) { return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; '); }
async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const response = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name, email: `${crypto.randomUUID()}@example.com`, password: 'password123' }) });
  expect(response.status).toBeLessThan(400);
  return cookieHeader(response);
}

describe('currency and localization routes', () => {
  it('requires authentication', async () => {
    const response = await createApp().request('/api/currency-settings');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('isolates settings and immutable dated rates by organisation', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');
        const initial = currencySettingsSchema.parse(await (await app.request('/api/currency-settings', { headers: { Cookie: ownerA } })).json());
        expect(initial.localization).toMatchObject({ baseCurrency: 'NZD', timezone: 'Pacific/Auckland', financialYearStartMonth: 4 });
        expect(initial.currencies.find((item) => item.code === 'JPY')?.precision).toBe(0);
        expect(initial.currencies.find((item) => item.code === 'BHD')?.precision).toBe(3);

        const changed = await app.request('/api/currency-settings', { method: 'PATCH', headers: { ...headers, Cookie: ownerA }, body: JSON.stringify({ timezone: 'Australia/Sydney', numberFormat: '1.234,56', financialYearStartMonth: 7, financialYearStartDay: 1 }) });
        expect(changed.status).toBe(200);
        expect(currencySettingsSchema.parse(await changed.json()).localization.timezone).toBe('Australia/Sydney');
        const isolated = currencySettingsSchema.parse(await (await app.request('/api/currency-settings', { headers: { Cookie: ownerB } })).json());
        expect(isolated.localization.timezone).toBe('Pacific/Auckland');

        const rateResponse = await app.request('/api/exchange-rates', { method: 'POST', headers: { ...headers, Cookie: ownerA }, body: JSON.stringify({ currencyCode: 'USD', effectiveDate: '2026-10-01', rate: '1.60005' }) });
        expect(rateResponse.status).toBe(201);
        const settings = currencySettingsSchema.parse(await rateResponse.json());
        expect(settings.rates[0]).toMatchObject({ currencyCode: 'USD', baseCurrency: 'NZD', rate: '1.60005', immutable: true });
        expect(currencySettingsSchema.parse(await (await app.request('/api/currency-settings', { headers: { Cookie: ownerB } })).json()).rates).toEqual([]);

        const missingRate = await app.request('/api/expenses', { method: 'POST', headers: { ...headers, Cookie: ownerB }, body: JSON.stringify({ description: 'US subscription', amount: '10.005', taxAmount: '1.005', currency: 'USD', expenseDate: '2026-10-20' }) });
        expect(missingRate.status).toBe(422);

        const foreignExpense = await app.request('/api/expenses', { method: 'POST', headers: { ...headers, Cookie: ownerA }, body: JSON.stringify({ description: 'US subscription', amount: '10.005', taxAmount: '1.005', currency: 'USD', expenseDate: '2026-10-20' }) });
        expect(foreignExpense.status).toBe(201);
        expect(await foreignExpense.json()).toMatchObject({ amount: '10.01', taxAmount: '1.01', currency: 'USD', exchangeRate: '1.60005', baseCurrency: 'NZD', baseAmount: '16.02', baseTaxAmount: '1.62' });
        const usedSettings = currencySettingsSchema.parse(await (await app.request('/api/currency-settings', { headers: { Cookie: ownerA } })).json());
        expect(usedSettings.rates[0]?.usageCount).toBe(1);
        expect((await app.request(`/api/exchange-rates/${usedSettings.rates[0]!.id}`, { method: 'DELETE', headers: { Cookie: ownerA } })).status).toBe(409);

        const duplicate = await app.request('/api/exchange-rates', { method: 'POST', headers: { ...headers, Cookie: ownerA }, body: JSON.stringify({ currencyCode: 'USD', effectiveDate: '2026-10-01', rate: '1.7' }) });
        expect(duplicate.status).toBe(409);
      } finally { await sql.end({ timeout: 5 }); }
    });
  });

  it('rounds only at declared precision and keeps exact decimal conversion', () => {
    expect(roundAt('1.005', 2)).toBe('1.01');
    expect(roundAt('123.5', 0)).toBe('124');
    expect(convertToBase('10.005', '1.60005', 2)).toBe('16.01');
  });
});
