import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  DEFAULT_ONBOARDING_COUNTRY,
  getDefaultTaxRate,
  stubBusinessName,
} from '../countryTaxDefaults';

describe('getDefaultTaxRate', () => {
  it('returns GST 15 for New Zealand', () => {
    expect(getDefaultTaxRate('New Zealand')).toBe(15);
  });

  it('returns GST 10 for Australia', () => {
    expect(getDefaultTaxRate('Australia')).toBe(10);
  });

  it('returns VAT 20 for United Kingdom', () => {
    expect(getDefaultTaxRate('United Kingdom')).toBe(20);
  });

  it('returns undefined for countries without a mapped rate', () => {
    expect(getDefaultTaxRate('United States')).toBeUndefined();
    expect(getDefaultTaxRate('Other')).toBeUndefined();
  });
});

describe('onboarding defaults', () => {
  it('uses INV-YYYY-SEQ as the invoice format', () => {
    expect(DEFAULT_INVOICE_NUMBER_FORMAT).toBe('INV-{YYYY}-{SEQ}');
  });

  it('defaults country to New Zealand', () => {
    expect(DEFAULT_ONBOARDING_COUNTRY).toBe('New Zealand');
  });

  it('prefers full name, then email local-part, then a fallback', () => {
    expect(
      stubBusinessName({
        email: 'owner@studio.test',
        user_metadata: { full_name: 'North Shore Studio' },
      })
    ).toBe('North Shore Studio');
    expect(stubBusinessName({ email: 'owner@studio.test' })).toBe('owner');
    expect(stubBusinessName(null)).toBe('My Business');
  });
});
