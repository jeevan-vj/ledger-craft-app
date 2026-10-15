import { describe, expect, it } from 'vitest';
import { describeMissingFields, getMissingProfileFields } from '../profileCompleteness';

describe('getMissingProfileFields', () => {
  it('returns all fields when profile is missing', () => {
    expect(getMissingProfileFields(null)).toEqual(['logo', 'address', 'bank']);
  });

  it('returns only unset fields', () => {
    expect(
      getMissingProfileFields({
        logoUrl: 'https://cdn.example.com/logo.png',
        address: '',
        city: 'Wellington',
        bankInfo: null,
      })
    ).toEqual(['bank']);
  });
});

describe('describeMissingFields', () => {
  it('joins two fields with and', () => {
    expect(describeMissingFields(['logo', 'bank'])).toBe('logo and bank details');
  });
});
