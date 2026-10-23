import { apiRequest } from '@/features/auth/api/http';

export type MobileCurrency = { code: string; name: string; precision: number; symbol: string; symbolPosition: 'before' | 'after'; enabled: boolean; isBase: boolean };
export type MobileCurrencySettings = {
  localization: { baseCurrency: string; locale: string; language: string; timezone: string; dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY'; numberFormat: '1,234.56' | '1.234,56' | '1 234,56'; financialYearStartMonth: number; financialYearStartDay: number; percentPosition: 'before' | 'after' };
  currencies: MobileCurrency[];
  rates: Array<{ id: string; currencyCode: string; baseCurrency: string; effectiveDate: string; rate: string; usageCount: number; immutable: true }>;
};

export const currencyApi = {
  get: () => apiRequest<MobileCurrencySettings>('/api/currency-settings'),
  update: (input: MobileCurrencySettings['localization']) => apiRequest<MobileCurrencySettings>('/api/currency-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
};
