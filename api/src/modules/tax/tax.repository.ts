import {
  taxConfigurationSchema,
  taxReturnSchema,
  type CreateTaxReturnRequest,
  type TaxConfigurationDto,
  type TaxReturnDto,
  type UpdateTaxReturnRequest,
  type UpsertTaxConfigurationRequest,
} from '@ledgercraft/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { taxConfigurations, taxReturns } from '../../db/schema/tax';
import { roundMoney } from '../invoices/money';

function toConfigDto(row: typeof taxConfigurations.$inferSelect): TaxConfigurationDto {
  return taxConfigurationSchema.parse({
    id: row.id,
    countryCode: row.countryCode,
    taxType: row.taxType,
    taxRate: roundMoney(row.taxRate),
    taxName: row.taxName,
    appliesToServices: row.appliesToServices,
    appliesToGoods: row.appliesToGoods,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toReturnDto(row: typeof taxReturns.$inferSelect): TaxReturnDto {
  return taxReturnSchema.parse({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    returnType: row.returnType,
    totalSales: roundMoney(row.totalSales),
    totalPurchases: roundMoney(row.totalPurchases),
    gstOnSales: roundMoney(row.gstOnSales),
    gstOnPurchases: roundMoney(row.gstOnPurchases),
    netGst: roundMoney(row.netGst),
    status: row.status,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    irdReference: row.irdReference ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function getActiveConfig(
  tx: Database,
  organisationId: string,
  countryCode = 'NZ',
): Promise<TaxConfigurationDto | undefined> {
  const [row] = await tx
    .select()
    .from(taxConfigurations)
    .where(
      and(
        eq(taxConfigurations.organisationId, organisationId),
        eq(taxConfigurations.countryCode, countryCode),
        eq(taxConfigurations.isActive, true),
      ),
    )
    .orderBy(desc(taxConfigurations.effectiveFrom));
  return row ? toConfigDto(row) : undefined;
}

export async function insertDefaultConfig(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: UpsertTaxConfigurationRequest,
): Promise<TaxConfigurationDto> {
  const [row] = await tx
    .insert(taxConfigurations)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      countryCode: input.countryCode ?? 'NZ',
      taxType: input.taxType ?? 'GST',
      taxRate: roundMoney(input.taxRate ?? '0.15'),
      taxName: input.taxName ?? 'GST',
      appliesToServices: input.appliesToServices ?? true,
      appliesToGoods: input.appliesToGoods ?? true,
      effectiveFrom: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      effectiveTo: input.effectiveTo ?? null,
      isActive: input.isActive ?? true,
    })
    .returning();
  if (!row) throw new Error('Failed to insert tax configuration');
  return toConfigDto(row);
}

export async function upsertConfig(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: UpsertTaxConfigurationRequest,
): Promise<TaxConfigurationDto> {
  const countryCode = input.countryCode ?? 'NZ';
  const existing = await getActiveConfig(tx, ctx.organisationId, countryCode);
  if (!existing) return insertDefaultConfig(tx, ctx, { ...input, countryCode });
  const patch: Partial<typeof taxConfigurations.$inferInsert> = { updatedAt: new Date() };
  if (input.taxType !== undefined) patch.taxType = input.taxType;
  if (input.taxRate !== undefined) patch.taxRate = roundMoney(input.taxRate);
  if (input.taxName !== undefined) patch.taxName = input.taxName;
  if (input.appliesToServices !== undefined) patch.appliesToServices = input.appliesToServices;
  if (input.appliesToGoods !== undefined) patch.appliesToGoods = input.appliesToGoods;
  if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom;
  if (input.effectiveTo !== undefined) patch.effectiveTo = input.effectiveTo;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const [row] = await tx
    .update(taxConfigurations)
    .set(patch)
    .where(and(eq(taxConfigurations.id, existing.id), eq(taxConfigurations.organisationId, ctx.organisationId)))
    .returning();
  return row ? toConfigDto(row) : existing;
}

export async function listReturns(tx: Database, organisationId: string): Promise<TaxReturnDto[]> {
  const rows = await tx
    .select()
    .from(taxReturns)
    .where(eq(taxReturns.organisationId, organisationId))
    .orderBy(desc(taxReturns.periodEnd));
  return rows.map(toReturnDto);
}

export async function getReturn(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<TaxReturnDto | undefined> {
  const [row] = await tx
    .select()
    .from(taxReturns)
    .where(and(eq(taxReturns.id, id), eq(taxReturns.organisationId, organisationId)));
  return row ? toReturnDto(row) : undefined;
}

export async function insertReturn(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateTaxReturnRequest,
): Promise<TaxReturnDto> {
  const [row] = await tx
    .insert(taxReturns)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      returnType: input.returnType ?? 'GST',
      totalSales: roundMoney(input.totalSales),
      totalPurchases: roundMoney(input.totalPurchases),
      gstOnSales: roundMoney(input.gstOnSales),
      gstOnPurchases: roundMoney(input.gstOnPurchases),
      netGst: roundMoney(input.netGst),
      status: input.status ?? 'draft',
      irdReference: input.irdReference ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert tax return');
  return toReturnDto(row);
}

export async function updateReturn(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateTaxReturnRequest,
): Promise<TaxReturnDto | undefined> {
  const existing = await getReturn(tx, organisationId, id);
  if (!existing) return undefined;
  const patch: Partial<typeof taxReturns.$inferInsert> = { updatedAt: new Date() };
  if (input.periodStart !== undefined) patch.periodStart = input.periodStart;
  if (input.periodEnd !== undefined) patch.periodEnd = input.periodEnd;
  if (input.returnType !== undefined) patch.returnType = input.returnType;
  if (input.totalSales !== undefined) patch.totalSales = roundMoney(input.totalSales);
  if (input.totalPurchases !== undefined) patch.totalPurchases = roundMoney(input.totalPurchases);
  if (input.gstOnSales !== undefined) patch.gstOnSales = roundMoney(input.gstOnSales);
  if (input.gstOnPurchases !== undefined) patch.gstOnPurchases = roundMoney(input.gstOnPurchases);
  if (input.netGst !== undefined) patch.netGst = roundMoney(input.netGst);
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === 'submitted') patch.submittedAt = new Date();
  }
  if (input.irdReference !== undefined) patch.irdReference = input.irdReference;
  const [row] = await tx
    .update(taxReturns)
    .set(patch)
    .where(and(eq(taxReturns.id, id), eq(taxReturns.organisationId, organisationId)))
    .returning();
  return row ? toReturnDto(row) : undefined;
}

export async function deleteReturn(tx: Database, organisationId: string, id: string): Promise<boolean> {
  const deleted = await tx
    .delete(taxReturns)
    .where(and(eq(taxReturns.id, id), eq(taxReturns.organisationId, organisationId)))
    .returning({ id: taxReturns.id });
  return deleted.length > 0;
}
