import { getDefaultTaxRate, stubBusinessName } from '../countryTaxDefaults';

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

  it('returns undefined for unmapped countries', () => {
    expect(getDefaultTaxRate('United States')).toBeUndefined();
  });
});

describe('stubBusinessName', () => {
  it('uses full name when present', () => {
    expect(
      stubBusinessName({
        email: 'owner@studio.test',
        user_metadata: { full_name: 'North Shore Studio' },
      })
    ).toBe('North Shore Studio');
  });
});
