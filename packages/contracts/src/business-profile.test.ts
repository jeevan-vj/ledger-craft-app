import { describe, expect, it } from 'vitest';
import { businessProfileSchema, upsertBusinessProfileRequestSchema } from './business-profile';

describe('business profile contracts', () => {
  const profile = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Kauri Studio Ltd',
    email: 'hello@kauristudio.nz',
    phone: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    country: 'NZ',
    taxId: null,
    logoUrl: null,
    website: null,
    defaultTaxRate: '15.0000',
    gstRegistrationStatus: 'registered',
    defaultTerms: null,
    paymentTermDays: 30,
    defaultNotes: null,
    bankInfo: null,
    theme: null,
    invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
    invoiceNumberSequence: 1,
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  };

  it('accepts a camelCase profile DTO without ownership ids', () => {
    expect(businessProfileSchema.parse(profile)).toEqual(profile);
  });

  it('rejects ownership ids on upsert', () => {
    const result = upsertBusinessProfileRequestSchema.safeParse({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      organisationId: '11111111-1111-1111-1111-111111111111',
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    expect(result.success).toBe(false);
  });

  it('accepts paymentTermDays on upsert', () => {
    const parsed = upsertBusinessProfileRequestSchema.parse({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      paymentTermDays: 14,
    });
    expect(parsed.paymentTermDays).toBe(14);
  });

  it('accepts an explicit GST registration status and rejects unknown values', () => {
    expect(upsertBusinessProfileRequestSchema.parse({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      gstRegistrationStatus: 'not_registered',
    }).gstRegistrationStatus).toBe('not_registered');

    expect(upsertBusinessProfileRequestSchema.safeParse({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      gstRegistrationStatus: 'sometimes',
    }).success).toBe(false);
  });
});

it('accepts separate bank fields as text and rejects oversized values', () => {
  const input = { name: 'Studio', email: 'studio@example.com', bankAccountName: ' Studio Ltd ', bankAccountNumber: '01-0123-0000123-00' };
  expect(upsertBusinessProfileRequestSchema.parse(input)).toMatchObject({ bankAccountName: 'Studio Ltd', bankAccountNumber: input.bankAccountNumber });
  expect(upsertBusinessProfileRequestSchema.safeParse({ ...input, bankAccountName: 'x'.repeat(201) }).success).toBe(false);
  expect(upsertBusinessProfileRequestSchema.safeParse({ ...input, bankAccountNumber: 123 }).success).toBe(false);
});
