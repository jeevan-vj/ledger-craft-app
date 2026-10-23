import { describe, expect, it } from 'vitest';
import { currencySettingsSchema, createExchangeRateRequestSchema, updateCurrencySettingsRequestSchema } from './currency';
import { financialYearForDate, formatCanonicalMoney, formatDateOnly } from './formatting';

describe('currency and localization contracts', () => {
  it('accepts a managed catalogue with zero and three decimal currencies', () => {
    const parsed = currencySettingsSchema.parse({
      localization: {
        baseCurrency: 'NZD', locale: 'en-NZ', language: 'en', timezone: 'Pacific/Auckland',
        dateFormat: 'DD/MM/YYYY', numberFormat: '1,234.56', financialYearStartMonth: 4,
        financialYearStartDay: 1, percentPosition: 'after',
      },
      currencies: [
        { code: 'NZD', name: 'New Zealand dollar', precision: 2, symbol: '$', symbolPosition: 'before', enabled: true, isBase: true },
        { code: 'JPY', name: 'Japanese yen', precision: 0, symbol: '¥', symbolPosition: 'before', enabled: true, isBase: false },
        { code: 'BHD', name: 'Bahraini dinar', precision: 3, symbol: 'BD', symbolPosition: 'after', enabled: true, isBase: false },
      ],
      rates: [],
    });
    expect(parsed.currencies.map((currency) => currency.precision)).toEqual([2, 0, 3]);
  });

  it('requires a positive canonical rate and an uppercase currency', () => {
    expect(createExchangeRateRequestSchema.safeParse({ currencyCode: 'USD', effectiveDate: '2026-10-23', rate: '0.581234' }).success).toBe(true);
    expect(createExchangeRateRequestSchema.safeParse({ currencyCode: 'usd', effectiveDate: '2026-10-23', rate: '0' }).success).toBe(false);
  });

  it('validates financial-year calendar boundaries', () => {
    expect(updateCurrencySettingsRequestSchema.safeParse({ financialYearStartMonth: 2, financialYearStartDay: 30 }).success).toBe(false);
    expect(updateCurrencySettingsRequestSchema.safeParse({ financialYearStartMonth: 2, financialYearStartDay: 29 }).success).toBe(true);
  });
});

describe('shared canonical formatting rules', () => {
  it('rounds only at declared precision without converting through number', () => {
    expect(formatCanonicalMoney('9007199254740993.555', { precision: 2, symbol: '$', symbolPosition: 'before' }, '1,234.56')).toBe('$9,007,199,254,740,993.56');
    expect(formatCanonicalMoney('1234.5', { precision: 0, symbol: '¥', symbolPosition: 'before' }, '1,234.56')).toBe('¥1,235');
    expect(formatCanonicalMoney('1234.5674', { precision: 3, symbol: 'BD', symbolPosition: 'after' }, '1.234,56')).toBe('1.234,567 BD');
  });

  it('formats dates and financial years deterministically', () => {
    expect(formatDateOnly('2026-10-23', 'DD/MM/YYYY')).toBe('23/10/2026');
    expect(financialYearForDate('2026-03-31', 4, 1)).toEqual({ from: '2025-04-01', to: '2026-03-31', label: 'FY 2025/26' });
    expect(financialYearForDate('2026-04-01', 4, 1)).toEqual({ from: '2026-04-01', to: '2027-03-31', label: 'FY 2026/27' });
  });
});
