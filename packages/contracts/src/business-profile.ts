import { z } from 'zod';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const themeSchema = z
  .object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    text: z.string(),
    textLight: z.string(),
    background: z.string(),
    surface: z.string(),
  })
  .nullable();

export const businessProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  country: z.string().min(1),
  taxId: z.string().nullable(),
  logoUrl: z.string().nullable(),
  website: z.string().nullable(),
  defaultTaxRate: money.nullable(),
  defaultTerms: z.string().nullable(),
  paymentTermDays: z.number().int().min(0).max(365),
  defaultNotes: z.string().nullable(),
  bankInfo: z.string().nullable(),
  bankAccountName: z.string().max(200).nullable().optional(),
  bankAccountNumber: z.string().max(100).nullable().optional(),
  theme: themeSchema,
  invoiceNumberFormat: z.string().nullable(),
  invoiceNumberSequence: z.number().int().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const upsertBusinessProfileRequestSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    country: z.string().min(1).optional(),
    taxId: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    defaultTaxRate: money.nullable().optional(),
    defaultTerms: z.string().nullable().optional(),
    paymentTermDays: z.number().int().min(0).max(365).optional(),
    defaultNotes: z.string().nullable().optional(),
    bankInfo: z.string().nullable().optional(),
    bankAccountName: z.string().trim().max(200).nullable().optional(),
    bankAccountNumber: z.string().trim().max(100).nullable().optional(),
    theme: themeSchema.optional(),
    invoiceNumberFormat: z.string().nullable().optional(),
    invoiceNumberSequence: z.number().int().optional(),
  })
  .strict();

export type BusinessProfileDto = z.infer<typeof businessProfileSchema>;
export type UpsertBusinessProfileRequest = z.infer<typeof upsertBusinessProfileRequestSchema>;
