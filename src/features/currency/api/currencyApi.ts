import {
  currencySettingsSchema,
  type CreateExchangeRateRequest,
  type CurrencySettingsDto,
  type UpdateCurrencySettingsRequest,
  type UpsertCurrencyRequest,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

async function request(path: string, init?: RequestInit): Promise<CurrencySettingsDto> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return currencySettingsSchema.parse(await response.json());
}

export const currencyApi = {
  get: () => request('/api/currency-settings'),
  update: (input: UpdateCurrencySettingsRequest) => request('/api/currency-settings', { method: 'PATCH', body: JSON.stringify(input) }),
  saveCurrency: (input: UpsertCurrencyRequest) => request(`/api/currencies/${input.code}`, { method: 'PUT', body: JSON.stringify(input) }),
  addRate: (input: CreateExchangeRateRequest) => request('/api/exchange-rates', { method: 'POST', body: JSON.stringify(input) }),
  async deleteRate(id: string) {
    const response = await fetch(`/api/exchange-rates/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) throw new Error((await readApiFailure(response)).message);
  },
};
