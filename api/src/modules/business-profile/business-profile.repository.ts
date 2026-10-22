import {
  businessProfileSchema,
  type BusinessProfileDto,
  type UpsertBusinessProfileRequest,
} from '@ledgercraft/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { businessProfiles } from '../../db/schema/business-profiles';
import { users } from '../../db/schema/identity';

function toDto(row: typeof businessProfiles.$inferSelect): BusinessProfileDto {
  return businessProfileSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zip: row.zip ?? null,
    country: row.country,
    taxId: row.taxId ?? null,
    logoUrl: row.logoUrl ?? null,
    website: row.website ?? null,
    defaultTaxRate: row.defaultTaxRate ?? null,
    gstRegistrationStatus: row.gstRegistrationStatus,
    defaultTerms: row.defaultTerms ?? null,
    paymentTermDays: row.paymentTermDays,
    defaultNotes: row.defaultNotes ?? null,
    bankInfo: row.bankInfo ?? null,
    bankAccountName: row.bankAccountName ?? null,
    bankAccountNumber: row.bankAccountNumber ?? null,
    theme: row.theme ?? null,
    invoiceNumberFormat: row.invoiceNumberFormat ?? null,
    invoiceNumberSequence: row.invoiceNumberSequence ?? null,
    quoteNumberFormat: row.quoteNumberFormat,
    quoteNumberSequence: row.quoteNumberSequence,
    quoteValidityDays: row.quoteValidityDays,
    defaultQuoteKind: row.defaultQuoteKind,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getBusinessProfile(
  tx: Database,
  organisationId: string,
): Promise<BusinessProfileDto | undefined> {
  const [row] = await tx
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organisationId, organisationId));
  return row ? toDto(row) : undefined;
}

export async function upsertBusinessProfile(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: UpsertBusinessProfileRequest,
): Promise<BusinessProfileDto> {
  const existing = await tx
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organisationId, ctx.organisationId));

  const values: Partial<typeof businessProfiles.$inferInsert> = {
    name: input.name,
    email: input.email,
    updatedAt: new Date(),
  };
  if (input.phone !== undefined) values.phone = input.phone;
  if (input.address !== undefined) values.address = input.address;
  if (input.city !== undefined) values.city = input.city;
  if (input.state !== undefined) values.state = input.state;
  if (input.zip !== undefined) values.zip = input.zip;
  if (input.country !== undefined) values.country = input.country;
  if (input.taxId !== undefined) values.taxId = input.taxId;
  if (input.logoUrl !== undefined) values.logoUrl = input.logoUrl;
  if (input.website !== undefined) values.website = input.website;
  if (input.defaultTaxRate !== undefined) values.defaultTaxRate = input.defaultTaxRate;
  if (input.gstRegistrationStatus !== undefined) values.gstRegistrationStatus = input.gstRegistrationStatus;
  if (input.defaultTerms !== undefined) values.defaultTerms = input.defaultTerms;
  if (input.paymentTermDays !== undefined) values.paymentTermDays = input.paymentTermDays;
  if (input.defaultNotes !== undefined) values.defaultNotes = input.defaultNotes;
  if (input.bankAccountName !== undefined) values.bankAccountName = input.bankAccountName;
  if (input.bankAccountNumber !== undefined) values.bankAccountNumber = input.bankAccountNumber;
  if (input.bankInfo !== undefined) values.bankInfo = input.bankInfo;
  if (input.theme !== undefined) values.theme = input.theme;
  if (input.invoiceNumberFormat !== undefined) values.invoiceNumberFormat = input.invoiceNumberFormat;
  if (input.invoiceNumberSequence !== undefined) values.invoiceNumberSequence = input.invoiceNumberSequence;
  if (input.quoteNumberFormat !== undefined) values.quoteNumberFormat = input.quoteNumberFormat;
  if (input.quoteNumberSequence !== undefined) values.quoteNumberSequence = input.quoteNumberSequence;
  if (input.quoteValidityDays !== undefined) values.quoteValidityDays = input.quoteValidityDays;
  if (input.defaultQuoteKind !== undefined) values.defaultQuoteKind = input.defaultQuoteKind;

  if (existing[0]) {
    const [row] = await tx
      .update(businessProfiles)
      .set(values)
      .where(and(eq(businessProfiles.id, existing[0].id), eq(businessProfiles.organisationId, ctx.organisationId)))
      .returning();
    if (!row) throw new Error('Failed to update business profile');
    return toDto(row);
  }

  const [row] = await tx
    .insert(businessProfiles)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      country: input.country ?? 'NZ',
      taxId: input.taxId ?? null,
      logoUrl: input.logoUrl ?? null,
      website: input.website ?? null,
      defaultTaxRate: input.defaultTaxRate ?? null,
      gstRegistrationStatus: input.gstRegistrationStatus ?? 'unknown',
      defaultTerms: input.defaultTerms ?? null,
      paymentTermDays: input.paymentTermDays ?? 30,
      defaultNotes: input.defaultNotes ?? null,
      bankInfo: input.bankInfo ?? null,
      bankAccountName: input.bankAccountName ?? null,
      bankAccountNumber: input.bankAccountNumber ?? null,
      theme: input.theme ?? null,
      invoiceNumberFormat: input.invoiceNumberFormat ?? 'INV-{YYYY}-{SEQ}',
      invoiceNumberSequence: input.invoiceNumberSequence ?? 1,
      quoteNumberFormat: input.quoteNumberFormat ?? 'QUO-{YYYY}-{SEQ}',
      quoteNumberSequence: input.quoteNumberSequence ?? 1,
      quoteValidityDays: input.quoteValidityDays ?? 30,
      defaultQuoteKind: input.defaultQuoteKind ?? 'quote',
    })
    .returning();
  if (!row) throw new Error('Failed to insert business profile');
  return toDto(row);
}

export async function ensureBusinessProfile(
  tx: Database,
  ctx: { organisationId: string; userId: string },
): Promise<typeof businessProfiles.$inferSelect | undefined> {
  const existing = await lockBusinessProfile(tx, ctx.organisationId);
  if (existing) return existing;

  const [user] = await tx.select().from(users).where(eq(users.id, ctx.userId));
  if (!user) return undefined;

  await upsertBusinessProfile(tx, ctx, {
    name: user.name.trim() || 'My business',
    email: user.email,
    country: 'NZ',
    invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
    invoiceNumberSequence: 1,
  });
  return lockBusinessProfile(tx, ctx.organisationId);
}

export async function lockBusinessProfile(
  tx: Database,
  organisationId: string,
): Promise<typeof businessProfiles.$inferSelect | undefined> {
  const rows = await tx
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organisationId, organisationId));
  return rows[0];
}

export async function bumpQuoteSequence(
  tx: Database,
  profileId: string,
  nextSequence: number,
): Promise<void> {
  await tx
    .update(businessProfiles)
    .set({ quoteNumberSequence: nextSequence, updatedAt: new Date() })
    .where(eq(businessProfiles.id, profileId));
}

export async function bumpInvoiceSequence(
  tx: Database,
  profileId: string,
  nextSequence: number,
): Promise<void> {
  await tx
    .update(businessProfiles)
    .set({ invoiceNumberSequence: nextSequence, updatedAt: new Date() })
    .where(eq(businessProfiles.id, profileId));
}
